"""Background tasks — email sending, DB-based scheduling, bounce detection.

No external broker needed. Uses FastAPI BackgroundTasks for immediate sends
and asyncio loops for polling scheduled rows and checking for bounces.
"""
import asyncio
import json
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import traceback

from app.database import SessionLocal
from app.models.email_column import EmailColumn
from app.models.template import Template
from app.models.document import Document
from app.models.job_result import JobResult
from app.models.sender_account import SenderAccount
from app.services import email_sender, template_handler
from app.services.settings_service import get_personal_info, get_smtp_settings
from app.services.vault import get_secret
from app.services.audit_service import log_audit_bg
from app import config
from app.logging_config import get_logger
from sqlalchemy.exc import OperationalError, DatabaseError

logger = get_logger("background")

# Thread pool for send jobs — prevents unbounded thread creation
_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="email-send")
# Track running job IDs to prevent duplicate dispatch
_running_jobs: set[str] = set()
_running_jobs_lock = threading.Lock()

# --------------------------------------------------------------------------- #
# Event bus — push real-time progress to SSE consumers                         #
# WARNING: All in-memory state below (subscribers, running-jobs set) only      #
# works with a single-process deployment (1 uvicorn worker). If you scale to   #
# multiple workers, replace with Redis Pub/Sub or a similar shared store.      #
# --------------------------------------------------------------------------- #

# Per-job subscribers: job_id → set of asyncio.Queue
_job_subscribers: dict[str, set[asyncio.Queue]] = {}
_job_subscribers_lock = threading.Lock()

# Global subscribers: receive lightweight job-level events for all jobs
_global_subscribers: set[asyncio.Queue] = set()
_global_subscribers_lock = threading.Lock()

# Reference to the running event loop (set during start_scheduler)
_event_loop: asyncio.AbstractEventLoop | None = None


def _publish_event(job_id: str, event_type: str, data: dict):
    """Publish an event to all subscribers (per-job + global).

    Thread-safe: called from ThreadPoolExecutor workers. Uses
    call_soon_threadsafe to push into async queues from sync threads.
    """
    loop = _event_loop
    if loop is None or loop.is_closed():
        return

    event = {"event": event_type, "data": data}

    with _job_subscribers_lock:
        queues = list(_job_subscribers.get(job_id, set()))
    for q in queues:
        try:
            loop.call_soon_threadsafe(q.put_nowait, event)
        except Exception:
            pass

    # Global subscribers only get job-level events (not per-email detail)
    if event_type in ("job_update", "job_started", "job_finished"):
        with _global_subscribers_lock:
            gqueues = list(_global_subscribers)
        for q in gqueues:
            try:
                loop.call_soon_threadsafe(q.put_nowait, event)
            except Exception:
                pass


def subscribe_job(job_id: str) -> asyncio.Queue:
    """Subscribe to events for a specific job. Returns a Queue to read from."""
    q: asyncio.Queue = asyncio.Queue()
    with _job_subscribers_lock:
        _job_subscribers.setdefault(job_id, set()).add(q)
    return q


def unsubscribe_job(job_id: str, q: asyncio.Queue):
    """Unsubscribe from a specific job's events."""
    with _job_subscribers_lock:
        if job_id in _job_subscribers:
            _job_subscribers[job_id].discard(q)
            if not _job_subscribers[job_id]:
                del _job_subscribers[job_id]


def subscribe_global() -> asyncio.Queue:
    """Subscribe to all job-level events. Returns a Queue to read from."""
    q: asyncio.Queue = asyncio.Queue()
    with _global_subscribers_lock:
        _global_subscribers.add(q)
    return q


def unsubscribe_global(q: asyncio.Queue):
    """Unsubscribe from global events."""
    with _global_subscribers_lock:
        _global_subscribers.discard(q)


# --------------------------------------------------------------------------- #
# Resilient DB helper — survives PgBouncer / Supabase idle disconnects        #
# --------------------------------------------------------------------------- #

def _safe_db_update(updates_fn, description: str = "db update"):
    """Open a short-lived session, apply *updates_fn(db)*, commit, close.

    If the commit fails due to a connection error (OperationalError /
    DatabaseError — e.g. SSL EOF from PgBouncer), the session is rolled back
    and closed, a brand-new session is opened, and the update is retried once.
    """
    db = SessionLocal()
    try:
        updates_fn(db)
        db.commit()
    except (OperationalError, DatabaseError) as exc:
        logger.warning(f"_safe_db_update({description}): connection error, retrying — {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        db.close()
        # Retry with a fresh session (pool_pre_ping validates the new conn)
        db = SessionLocal()
        try:
            updates_fn(db)
            db.commit()
        except Exception as retry_exc:
            logger.error(f"_safe_db_update({description}): retry also failed — {retry_exc}")
            try:
                db.rollback()
            except Exception:
                pass
            raise
        finally:
            db.close()
        return  # retry succeeded; skip the outer finally-close
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Email send logic (runs in a thread via BackgroundTasks)                      #
# --------------------------------------------------------------------------- #


def send_email_batch(job_result_id: str, row_ids: list[str]):
    """Send emails for the given campaign row IDs.

    Uses short-lived DB sessions so the connection is never held idle during
    SMTP sends or inter-email sleeps.  This prevents the
    ``psycopg2.OperationalError: SSL SYSCALL error: EOF detected`` that occurs
    when Supabase PgBouncer drops a connection that sits idle for >5 min.

    The function is split into phases:
      A) Mark job running               (own session)
      B) Load all data into memory      (own session, then closed)
      C) Send loop — per email          (fresh session per DB write)
      D) Finalize job result            (own session)
      E) Fatal error handler            (fresh session)
    """
    # ── Phase A: Mark job running ─────────────────────────────────────────
    try:
        def _mark_running(db):
            jr = db.query(JobResult).get(job_result_id)
            if not jr:
                raise ValueError("not_found")
            jr.status = "running"

        _safe_db_update(_mark_running, f"job {job_result_id} → running")
    except ValueError:
        logger.error(f"JobResult {job_result_id} not found — aborting")
        return

    # Publish job started (no DB needed)
    _publish_event(job_result_id, "job_started", {
        "job_id": job_result_id, "status": "running", "total": 0,
        "sent": 0, "failed": 0,
    })

    # ── Phase B: Load all data into plain dicts (then release session) ────
    db = SessionLocal()
    try:
        rows_raw = db.query(EmailColumn).filter(EmailColumn.id.in_(row_ids)).all()
        total = len(rows_raw)

        # Update total
        jr = db.query(JobResult).get(job_result_id)
        if jr:
            jr.total = total
            db.commit()

        if not rows_raw:
            logger.warning(f"Job {job_result_id}: no rows found for given IDs")
            if jr:
                jr.status = "completed"
                jr.completed_at = datetime.now(tz=timezone.utc)
                db.commit()
            return

        # Snapshot each row into a dict so we don't need the session later
        rows_data: list[dict] = []
        for r in sorted(rows_raw, key=lambda r: r.sender_email or ""):
            rows_data.append({
                "id": str(r.id),
                "user_id": r.user_id or "",
                "sender_email": r.sender_email,
                "recipient_email": r.recipient_email,
                "recipient_name": r.recipient_name,
                "company": r.company,
                "position": r.position,
                "framework": r.framework,
                "my_strength": r.my_strength,
                "audience_value": r.audience_value,
                "template_file": r.template_file,
                "custom_fields": r.custom_fields or {},
                "sent_status": r.sent_status,
            })

        _user_id = rows_data[0]["user_id"] if rows_data else ""
        personal = get_personal_info(db, _user_id)
        smtp_settings = get_smtp_settings(db, _user_id)
        smtp_server = smtp_settings["smtp_server"]
        smtp_port = int(smtp_settings["smtp_port"])
        sleep_seconds = float(smtp_settings["sleep_between_emails"])

        # Pre-load templates → dict[name, {subject_line, body_html}]
        _template_names = {rd["template_file"] for rd in rows_data}
        _template_names |= {n.replace(".html", "") for n in _template_names}
        _all_templates = db.query(Template).filter(Template.name.in_(_template_names)).all()
        template_map: dict[str, dict] = {}
        for _t in _all_templates:
            template_map[_t.name] = {"subject_line": _t.subject_line, "body_html": _t.body_html}

        # Pre-load sender accounts → dict[email, {provider, display_name, smtp_host, smtp_port, vault_secret_name}]
        _all_senders = list({rd["sender_email"] for rd in rows_data if rd["sender_email"]})
        _sender_accounts_raw = (
            db.query(SenderAccount)
            .filter(SenderAccount.email.in_(_all_senders), SenderAccount.user_id == _user_id)
            .all()
        ) if _all_senders else []
        sender_account_map: dict[str, dict] = {}
        for sa in _sender_accounts_raw:
            sender_account_map[sa.email] = {
                "provider": sa.provider,
                "display_name": sa.display_name,
                "smtp_host": sa.smtp_host,
                "smtp_port": sa.smtp_port,
                "vault_secret_name": sa.vault_secret_name,
            }

        # Pre-load credentials (from vault)
        credential_map: dict[str, str] = {}
        for email, acct in sender_account_map.items():
            cred = get_secret(db, acct["vault_secret_name"])
            if cred:
                credential_map[email] = cred

        # Pre-load documents → attachment bytes
        _all_row_ids = [rd["id"] for rd in rows_data]
        _global_docs = db.query(Document).filter(
            Document.scope == "global", Document.user_id == _user_id
        ).all()
        _sender_docs_all = db.query(Document).filter(
            Document.scope == "sender", Document.scope_ref.in_(_all_senders), Document.user_id == _user_id
        ).all() if _all_senders else []
        _row_docs_all = db.query(Document).filter(
            Document.scope == "campaign_row", Document.scope_ref.in_(_all_row_ids)
        ).all() if _all_row_ids else []
        # Snapshot doc metadata (download happens per-row to avoid huge memory)
        _sender_doc_map: dict[str, list] = {}
        for _d in _sender_docs_all:
            _sender_doc_map.setdefault(_d.scope_ref, []).append(
                {"file_path": _d.file_path, "original_name": _d.original_name, "mime_type": _d.mime_type}
            )
        _row_doc_map: dict[str, list] = {}
        for _d in _row_docs_all:
            _row_doc_map.setdefault(_d.scope_ref, []).append(
                {"file_path": _d.file_path, "original_name": _d.original_name, "mime_type": _d.mime_type}
            )
        _global_doc_list = [
            {"file_path": _d.file_path, "original_name": _d.original_name, "mime_type": _d.mime_type}
            for _d in _global_docs
        ]
    except Exception as e:
        logger.error(f"Job {job_result_id}: failed to load data — {e}")
        _safe_db_update(
            lambda db: _set_job_error(db, job_result_id, str(e)),
            f"job {job_result_id} → error (load phase)",
        )
        raise
    finally:
        db.close()  # Session released — all data is in plain dicts now

    # ── Phase C: Send loop — no long-lived DB session ─────────────────────
    current_sender = None
    server = None
    sent = 0
    failed = 0
    errors: list[str] = []

    for rd in rows_data:
        if rd["sent_status"] in ("sent", "response"):
            continue

        required_sender = rd["sender_email"]
        if not required_sender:
            failed += 1
            errors.append(f"Row {rd['id']}: no sender email")
            continue

        # Switch SMTP connection when sender changes
        if required_sender != current_sender:
            if server:
                try:
                    server.quit()
                except Exception:
                    pass
                server = None

            acct = sender_account_map.get(required_sender)
            if not acct:
                failed += 1
                errors.append(f"Row {rd['id']}: no sender account for {required_sender}")
                current_sender = None
                continue

            cred = credential_map.get(required_sender)
            if not cred:
                failed += 1
                errors.append(f"Row {rd['id']}: no credential for {required_sender}")
                current_sender = None
                continue

            # Audit: credential accessed
            log_audit_bg(
                user_id=rd["user_id"],
                event_type="credential.accessed",
                resource_type="vault_secret",
                resource_id=acct["vault_secret_name"],
                detail={"purpose": "email_send", "job_id": job_result_id},
            )

            if acct["provider"] == "smtp":
                smtp_host = acct["smtp_host"] or smtp_server
                smtp_port_val = acct["smtp_port"] or smtp_port
                try:
                    server = email_sender.login_to_server(smtp_host, smtp_port_val, required_sender, cred)
                    current_sender = required_sender
                except Exception as e:
                    failed += 1
                    errors.append(f"Row {rd['id']}: SMTP login failed: {e}")
                    server = None
                    current_sender = None
                    continue
            elif acct["provider"] == "resend":
                current_sender = required_sender
                server = None
            else:
                failed += 1
                errors.append(f"Row {rd['id']}: unknown provider {acct['provider']}")
                current_sender = None
                continue

        acct = sender_account_map.get(current_sender or "")
        if acct is None:
            failed += 1
            continue
        if acct["provider"] == "smtp" and server is None:
            failed += 1
            continue

        # Load template from pre-loaded map
        tpl_key = rd["template_file"].replace(".html", "")
        tpl = template_map.get(tpl_key) or template_map.get(rd["template_file"])
        if not tpl:
            failed += 1
            errors.append(f"Row {rd['id']}: template '{rd['template_file']}' not found")
            continue

        # Gather attachments (download here so memory is released each iteration)
        from app.services.storage import download_file as sb_download
        files_to_send: list[tuple] = []
        sender_docs = _sender_doc_map.get(current_sender or "", [])
        row_docs = _row_doc_map.get(rd["id"], [])
        all_docs = sender_docs + _global_doc_list + row_docs
        for doc in all_docs:
            try:
                data = sb_download(doc["file_path"])
                files_to_send.append((data, doc["original_name"], doc["mime_type"]))
            except Exception as e:
                logger.warning(f"Could not download attachment {doc['file_path']}: {e}")

        # Personalize template
        try:
            subject, body, image_to_embed = template_handler.personalize_template(
                tpl["subject_line"],
                tpl["body_html"],
                recipient_name=rd["recipient_name"],
                company=rd["company"],
                position=rd["position"],
                framework=rd["framework"],
                my_strength=rd["my_strength"],
                audience_value=rd["audience_value"],
                your_name=personal["your_name"],
                your_phone_number=personal["your_phone"],
                your_email=current_sender,
                your_city_and_state=personal["your_city_state"],
                image_assets_folder=str(config.SELFIE_DIR),
                template_file_name=rd["template_file"],
                **rd["custom_fields"],
            )
        except Exception as e:
            failed += 1
            errors.append(f"Row {rd['id']}: template error: {e}")
            continue

        # ── SMTP send (no DB held) ──
        row_id = rd["id"]
        try:
            if acct["provider"] == "smtp":
                email_sender.send_email(
                    server,
                    current_sender,
                    rd["recipient_email"],
                    subject,
                    body,
                    attachment_paths=files_to_send,
                    inline_image_path=image_to_embed,
                )
            elif acct["provider"] == "resend":
                resend_key = credential_map.get(current_sender or "", "")
                email_sender.send_email_resend(
                    api_key=resend_key,
                    from_email=current_sender,
                    from_name=acct["display_name"],
                    to_email=rd["recipient_email"],
                    subject=subject,
                    html_body=body,
                    attachments=files_to_send,
                )

            # ── DB write: mark sent (short-lived session) ──
            sent += 1
            _sent = sent
            _failed = failed
            _total = total

            def _mark_sent(db, _row_id=row_id, _s=_sent, _f=_failed, _t=_total):
                row = db.query(EmailColumn).get(_row_id)
                if row:
                    row.sent_status = "sent"
                    row.sent_at = datetime.now(tz=timezone.utc)
                jr = db.query(JobResult).get(job_result_id)
                if jr:
                    jr.sent = _s

            _safe_db_update(_mark_sent, f"row {row_id} → sent")
            logger.info(f"Job {job_result_id}: sent to {rd['recipient_email']} (row {row_id})")

            _publish_event(job_result_id, "email_update", {
                "job_id": job_result_id, "row_id": row_id,
                "recipient_email": rd["recipient_email"],
                "recipient_name": rd["recipient_name"] or "",
                "company": rd["company"] or "",
                "sent_status": "sent",
                "sent_at": datetime.now(tz=timezone.utc).isoformat() + "Z",
            })
            _publish_event(job_result_id, "job_update", {
                "job_id": job_result_id, "status": "running",
                "sent": sent, "failed": failed, "total": total,
            })

            log_audit_bg(
                user_id=rd["user_id"],
                event_type="email.sent",
                resource_type="email_column",
                resource_id=row_id,
                detail={"recipient": rd["recipient_email"], "job_id": job_result_id},
            )

            time.sleep(sleep_seconds)

        except Exception as e:
            # ── DB write: mark failed (short-lived session) ──
            failed += 1
            errors.append(f"Row {row_id}: send failed: {e}")
            _failed = failed
            _errors_snapshot = list(errors)

            def _mark_failed(db, _row_id=row_id, _f=_failed, _errs=_errors_snapshot):
                row = db.query(EmailColumn).get(_row_id)
                if row:
                    row.sent_status = "failed"
                jr = db.query(JobResult).get(job_result_id)
                if jr:
                    jr.failed = _f
                    jr.errors = _errs

            _safe_db_update(_mark_failed, f"row {row_id} → failed")
            logger.error(f"Job {job_result_id}: failed row {row_id}: {e}")

            _publish_event(job_result_id, "email_update", {
                "job_id": job_result_id, "row_id": row_id,
                "recipient_email": rd["recipient_email"],
                "recipient_name": rd["recipient_name"] or "",
                "company": rd["company"] or "",
                "sent_status": "failed",
                "sent_at": None,
            })
            _publish_event(job_result_id, "job_update", {
                "job_id": job_result_id, "status": "running",
                "sent": sent, "failed": failed, "total": total,
            })

            log_audit_bg(
                user_id=rd["user_id"],
                event_type="email.failed",
                resource_type="email_column",
                resource_id=row_id,
                detail={"recipient": rd["recipient_email"], "job_id": job_result_id, "error": str(e)},
            )

    # Close SMTP connection
    if server:
        try:
            server.quit()
        except Exception:
            pass

    # ── Phase D: Finalize job result ──────────────────────────────────────
    _final_sent = sent
    _final_failed = failed
    _final_errors = list(errors)

    try:
        def _finalize(db):
            jr = db.query(JobResult).get(job_result_id)
            if jr:
                jr.sent = _final_sent
                jr.failed = _final_failed
                jr.errors = _final_errors
                jr.status = "completed"
                jr.completed_at = datetime.now(tz=timezone.utc)

        _safe_db_update(_finalize, f"job {job_result_id} → completed")
        logger.info(f"Job {job_result_id}: completed — sent={sent}, failed={failed}")

        _publish_event(job_result_id, "job_finished", {
            "job_id": job_result_id, "status": "completed",
            "sent": sent, "failed": failed, "total": total,
            "completed_at": datetime.now(tz=timezone.utc).isoformat() + "Z",
        })
    except Exception as e:
        logger.error(f"Job {job_result_id}: failed to finalize — {e}")


def _set_job_error(db, job_result_id: str, error_msg: str):
    """Helper used by _safe_db_update to mark a job as errored."""
    jr = db.query(JobResult).get(job_result_id)
    if jr:
        jr.status = "error"
        jr.errors = (jr.errors or []) + [error_msg]
        jr.completed_at = datetime.now(tz=timezone.utc)
        _publish_event(job_result_id, "job_finished", {
            "job_id": job_result_id, "status": "error",
            "sent": jr.sent, "failed": jr.failed, "total": jr.total,
            "completed_at": jr.completed_at.isoformat() + "Z",
        })


# --------------------------------------------------------------------------- #
# Scheduler loop — polls the DB every 60 s for due rows                       #
# --------------------------------------------------------------------------- #

_scheduler_task: asyncio.Task | None = None
_bounce_task: asyncio.Task | None = None
_ooo_expire_task: asyncio.Task | None = None


_scheduler_consecutive_errors = 0


async def _scheduler_loop():
    """Async loop: every 60 s, find rows with scheduled_at <= now and send."""
    global _scheduler_consecutive_errors
    logger.info("Scheduler loop started (60 s interval)")
    while True:
        try:
            await asyncio.sleep(60)
            _check_due_rows()
            _scheduler_consecutive_errors = 0
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
            break
        except Exception as e:
            _scheduler_consecutive_errors += 1
            if _scheduler_consecutive_errors > 5:
                logger.critical(
                    f"Scheduler loop: {_scheduler_consecutive_errors} consecutive errors! "
                    f"Latest: {e}\n{traceback.format_exc()}"
                )
            else:
                logger.error(f"Scheduler loop error: {e}\n{traceback.format_exc()}")


async def _bounce_check_loop():
    """Async loop: periodically scan IMAP inboxes for bounces."""
    interval = config.BOUNCE_CHECK_INTERVAL
    logger.info(f"Bounce check loop started ({interval}s interval)")
    # Initial delay — let the app fully start before first scan
    await asyncio.sleep(30)
    while True:
        try:
            # Read the bounce_check_enabled setting from DB (persisted toggle)
            enabled = _is_bounce_enabled()
            if enabled:
                t = threading.Thread(target=_run_bounce_check, daemon=True)
                t.start()
            else:
                logger.debug("Bounce check skipped — disabled via settings")
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Bounce check loop cancelled")
            break
        except Exception as e:
            logger.error(f"Bounce check loop error: {e}")
            await asyncio.sleep(60)  # back off on error


def _is_bounce_enabled() -> bool:
    """Check if bounce scanning is enabled via the per-user setting.

    Falls back to the BOUNCE_CHECK_ENABLED env var if no DB setting exists.
    """
    try:
        from app.services.settings_service import get_setting_value
        db = SessionLocal()
        try:
            from app.models.user_role import UserRole
            master = db.query(UserRole.user_id).filter(UserRole.role == "master_admin").first()
            master_uid = master[0] if master else ""
            val = get_setting_value(db, master_uid, "bounce_check_enabled", "")
            if val:
                return val.lower() in ("true", "1", "yes")
            # Fallback to env var if setting not yet seeded
            return config.BOUNCE_CHECK_ENABLED
        finally:
            db.close()
    except Exception:
        return config.BOUNCE_CHECK_ENABLED


def _run_bounce_check():
    """Run a full bounce scan in a background thread."""
    try:
        from app.services.bounce_scanner import run_full_scan
        stats = run_full_scan()
        logger.info(f"Bounce check done: {stats}")
    except Exception as e:
        logger.error(f"Bounce check failed: {e}")


async def _ooo_expire_loop():
    """Async loop: sleep until the nearest OOO return date, then expire those contacts.

    Uses a priority-queue approach: query the DB for the soonest
    ooo_return_date, sleep until that time, expire all contacts whose
    return date has passed, repeat.  Falls back to polling every 60 min
    when no pending expirations exist.
    """
    logger.info("OOO expire loop started (priority-queue scheduler)")
    # Initial delay — let the app start
    await asyncio.sleep(120)
    while True:
        try:
            next_wake = _run_ooo_expire()  # returns seconds until next expiry (or None)
            sleep_secs = min(next_wake, 3600) if next_wake else 3600
            # Clamp to at least 10 s to avoid busy-loop on clock skew
            sleep_secs = max(sleep_secs, 10)
            logger.debug(f"OOO expire: next wake in {sleep_secs:.0f}s")
            await asyncio.sleep(sleep_secs)
        except asyncio.CancelledError:
            logger.info("OOO expire loop cancelled")
            break
        except Exception as e:
            logger.error(f"OOO expire loop error: {e}")
            await asyncio.sleep(300)


def _run_ooo_expire() -> float | None:
    """Expire OOO contacts whose return date has passed, reset their status.

    Returns the number of seconds until the next soonest ooo_return_date,
    or None if no contacts have a pending return date.
    """
    import re as _re
    from datetime import date as _date
    from sqlalchemy import func as _func
    from app.models.recruiter import Recruiter
    from app.models.referral import Referral

    db = SessionLocal()
    try:
        today = _date.today()
        expired = 0

        for Model in [Recruiter, Referral]:
            rows = db.query(Model).filter(
                Model.ooo_return_date != None,  # noqa: E711
                Model.ooo_return_date <= today,
            ).all()
            for row in rows:
                row.notes = _re.sub(
                    r"^\[OOO\s+\d{4}-\d{2}-\d{2}\]\s*[^\n]*\n?",
                    "", row.notes or "",
                )
                row.ooo_return_date = None
                # Reset email_status from "ooo" back to "valid"
                if row.email_status == "ooo":
                    row.email_status = "valid"
                expired += 1

        if expired > 0:
            db.commit()
            logger.info(f"OOO auto-expire: cleared {expired} contacts")

        # Find the soonest future ooo_return_date to schedule next wake
        soonest = None
        for Model in [Recruiter, Referral]:
            row = db.query(_func.min(Model.ooo_return_date)).filter(
                Model.ooo_return_date != None,  # noqa: E711
                Model.ooo_return_date > today,
            ).scalar()
            if row is not None:
                if soonest is None or row < soonest:
                    soonest = row

        if soonest is not None:
            from datetime import datetime as _dt, timezone as _tz
            delta = _dt.combine(soonest, _dt.min.time()).replace(tzinfo=_tz.utc) - _dt.now(tz=_tz.utc)
            return max(delta.total_seconds(), 0)
        return None
    except Exception as e:
        logger.error(f"OOO auto-expire failed: {e}")
        return None
    finally:
        db.close()


def _check_due_rows():
    """Find scheduled JobResults whose rows are due and dispatch send jobs.

    Uses SELECT … FOR UPDATE SKIP LOCKED to prevent double-dispatch in
    multi-worker deployments and a dedup set to skip already-running jobs.
    """
    db = SessionLocal()
    try:
        now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

        # Find all "scheduled" jobs that have stored row_ids, locking rows
        scheduled_jobs = (
            db.query(JobResult)
            .filter(JobResult.status == "scheduled", JobResult.row_ids != None)  # noqa: E711
            .with_for_update(skip_locked=True)
            .all()
        )
        if not scheduled_jobs:
            return

        for jr in scheduled_jobs:
            # Skip if this job is already running
            with _running_jobs_lock:
                if jr.id in _running_jobs:
                    continue

            # Check if any of this job's rows are due
            due_rows = (
                db.query(EmailColumn)
                .filter(
                    EmailColumn.id.in_(jr.row_ids),
                    EmailColumn.scheduled_at != None,  # noqa: E711
                    EmailColumn.scheduled_at <= now,
                    EmailColumn.sent_status == "pending",
                )
                .all()
            )
            if not due_rows:
                continue

            row_ids = [str(r.id) for r in due_rows]
            logger.info(f"check_due_rows: job {jr.id} — {len(row_ids)} rows due, dispatching")

            # Clear scheduled_at so they don't get picked up again
            for row in due_rows:
                row.scheduled_at = None

            # Reuse the existing JobResult — update to queued
            jr.status = "queued"
            db.commit()

            # Track & dispatch via executor
            with _running_jobs_lock:
                _running_jobs.add(jr.id)
            _executor.submit(_run_job_then_cleanup, jr.id, row_ids)

        # --- Stale-job detection ---
        # Mark jobs that have been "scheduled" for >15 min past their
        # scheduled_at but whose email rows are no longer dispatchable.
        _STALE_THRESHOLD = timedelta(minutes=15)
        stale_cutoff = now - _STALE_THRESHOLD

        stale_candidates = (
            db.query(JobResult)
            .filter(
                JobResult.status == "scheduled",
                JobResult.scheduled_at != None,  # noqa: E711
                JobResult.scheduled_at <= stale_cutoff,
            )
            .with_for_update(skip_locked=True)
            .all()
        )

        for jr in stale_candidates:
            with _running_jobs_lock:
                if jr.id in _running_jobs:
                    continue

            # Check if there are any dispatchable rows left
            dispatchable = 0
            if jr.row_ids:
                dispatchable = (
                    db.query(EmailColumn)
                    .filter(
                        EmailColumn.id.in_(jr.row_ids),
                        EmailColumn.scheduled_at != None,  # noqa: E711
                        EmailColumn.sent_status == "pending",
                    )
                    .count()
                )

            if dispatchable == 0:
                # Rows are not dispatchable — mark job as stale
                reason = (
                    f"Scheduled time {jr.scheduled_at.isoformat()}Z passed "
                    f"{(_STALE_THRESHOLD.total_seconds() / 60):.0f}+ min ago "
                    f"but email rows are no longer dispatchable "
                    f"(scheduled_at cleared or sent_status changed)."
                )
                jr.status = "stale"
                jr.errors = (jr.errors or []) + [reason]
                jr.completed_at = datetime.now(tz=timezone.utc)
                db.commit()
                logger.warning(f"Stale job detected: {jr.id} — {reason}")
                _publish_event(jr.id, "job_finished", {
                    "job_id": jr.id, "status": "stale",
                    "sent": jr.sent, "failed": jr.failed, "total": jr.total,
                    "completed_at": jr.completed_at.isoformat() + "Z",
                })
    finally:
        db.close()


def _run_job_then_cleanup(job_id: str, row_ids: list[str]):
    """Run send_email_batch and remove from _running_jobs on completion."""
    try:
        send_email_batch(job_id, row_ids)
    finally:
        with _running_jobs_lock:
            _running_jobs.discard(job_id)


def start_scheduler(app=None):
    """Start the background scheduler loop, bounce checker, and OOO expirer. Call during FastAPI lifespan startup."""
    global _scheduler_task, _bounce_task, _ooo_expire_task, _event_loop
    loop = asyncio.get_event_loop()
    _event_loop = loop
    _scheduler_task = loop.create_task(_scheduler_loop())
    _bounce_task = loop.create_task(_bounce_check_loop())
    _ooo_expire_task = loop.create_task(_ooo_expire_loop())
    logger.info("Background scheduler + bounce checker + OOO expirer registered")


def stop_scheduler():
    """Cancel the scheduler, bounce, and OOO expire loops.

    Also shuts down the thread-pool executor, waiting for in-flight email
    batches to finish (up to the Docker stop_grace_period).
    Call during FastAPI lifespan shutdown.
    """
    global _scheduler_task, _bounce_task, _ooo_expire_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
    if _bounce_task and not _bounce_task.done():
        _bounce_task.cancel()
    if _ooo_expire_task and not _ooo_expire_task.done():
        _ooo_expire_task.cancel()

    # Let running email-send threads finish; don't start new ones.
    logger.info("Shutting down email-send thread pool (waiting for in-flight jobs)…")
    _executor.shutdown(wait=True, cancel_futures=False)
    logger.info("Background scheduler + bounce checker + OOO expirer stopped")
