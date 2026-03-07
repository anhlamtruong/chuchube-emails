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
from datetime import datetime, timezone

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
# Email send logic (runs in a thread via BackgroundTasks)                      #
# --------------------------------------------------------------------------- #


def send_email_batch(job_result_id: str, row_ids: list[str]):
    """Send emails for the given campaign row IDs.

    Creates / updates a JobResult row for persistent status tracking.
    """
    db = SessionLocal()
    try:
        # Mark job running
        jr = db.query(JobResult).get(job_result_id)
        if not jr:
            logger.error(f"JobResult {job_result_id} not found — aborting")
            return
        jr.status = "running"
        db.commit()

        # Publish job started event
        _publish_event(job_result_id, "job_started", {
            "job_id": job_result_id, "status": "running", "total": jr.total,
            "sent": 0, "failed": 0,
        })

        rows = db.query(EmailColumn).filter(EmailColumn.id.in_(row_ids)).all()
        jr.total = len(rows)
        db.commit()

        # Derive user_id from the first row to fetch per-user settings
        _user_id = rows[0].user_id if rows else ""
        personal = get_personal_info(db, _user_id)
        smtp_settings = get_smtp_settings(db, _user_id)
        smtp_server = smtp_settings["smtp_server"]
        smtp_port = int(smtp_settings["smtp_port"])
        sleep_seconds = float(smtp_settings["sleep_between_emails"])

        current_sender = None
        current_account = None  # SenderAccount object
        server = None
        sent = 0
        failed = 0
        errors: list[str] = []

        rows_sorted = sorted(rows, key=lambda r: r.sender_email or "")

        # --- Pre-load templates & documents to avoid N+1 queries per row ---
        _template_names = {r.template_file for r in rows_sorted}
        _template_names |= {n.replace(".html", "") for n in _template_names}
        _all_templates = db.query(Template).filter(Template.name.in_(_template_names)).all()
        _template_map: dict[str, Template] = {}
        for _t in _all_templates:
            _template_map[_t.name] = _t

        _all_row_ids = [str(r.id) for r in rows_sorted]
        _all_senders = list({r.sender_email for r in rows_sorted if r.sender_email})
        _global_docs = db.query(Document).filter(
            Document.scope == "global", Document.user_id == _user_id
        ).all()
        _sender_docs_all = db.query(Document).filter(
            Document.scope == "sender", Document.scope_ref.in_(_all_senders), Document.user_id == _user_id
        ).all() if _all_senders else []
        _row_docs_all = db.query(Document).filter(
            Document.scope == "campaign_row", Document.scope_ref.in_(_all_row_ids)
        ).all() if _all_row_ids else []
        # Index sender docs and row docs for O(1) lookup
        _sender_doc_map: dict[str, list] = {}
        for _d in _sender_docs_all:
            _sender_doc_map.setdefault(_d.scope_ref, []).append(_d)
        _row_doc_map: dict[str, list] = {}
        for _d in _row_docs_all:
            _row_doc_map.setdefault(_d.scope_ref, []).append(_d)
        # --- End pre-load ---

        for row in rows_sorted:
            if row.sent_status in ("sent", "response"):
                continue

            required_sender = row.sender_email
            if not required_sender:
                failed += 1
                errors.append(f"Row {row.id}: no sender email")
                continue

            # Switch connection when sender changes
            if required_sender != current_sender:
                if server:
                    try:
                        server.quit()
                    except Exception:
                        pass
                    server = None

                # Look up sender account from DB
                account = db.query(SenderAccount).filter(
                    SenderAccount.email == required_sender,
                    SenderAccount.user_id == row.user_id,
                ).first()
                if not account:
                    failed += 1
                    errors.append(f"Row {row.id}: no sender account for {required_sender}")
                    current_sender = None
                    current_account = None
                    continue

                # Retrieve credential from Vault
                credential = get_secret(db, account.vault_secret_name)
                if not credential:
                    failed += 1
                    errors.append(f"Row {row.id}: no credential in Vault for {required_sender}")
                    current_sender = None
                    current_account = None
                    continue

                # Audit: credential accessed for email sending
                log_audit_bg(
                    user_id=row.user_id or "",
                    event_type="credential.accessed",
                    resource_type="vault_secret",
                    resource_id=account.vault_secret_name,
                    detail={"purpose": "email_send", "job_id": job_result_id},
                )

                current_account = account

                if account.provider == "smtp":
                    smtp_host = account.smtp_host or smtp_server
                    smtp_port_val = account.smtp_port or smtp_port
                    try:
                        server = email_sender.login_to_server(
                            smtp_host, smtp_port_val, required_sender, credential
                        )
                        current_sender = required_sender
                    except Exception as e:
                        failed += 1
                        errors.append(f"Row {row.id}: SMTP login failed: {e}")
                        server = None
                        current_sender = None
                        current_account = None
                        continue
                elif account.provider == "resend":
                    # Resend doesn't maintain a persistent connection; just store the key
                    current_sender = required_sender
                    server = None  # no SMTP server for resend
                else:
                    failed += 1
                    errors.append(f"Row {row.id}: unknown provider {account.provider}")
                    current_sender = None
                    current_account = None
                    continue

            if current_account is None:
                failed += 1
                continue
            if current_account.provider == "smtp" and server is None:
                failed += 1
                continue

            # Load template from pre-loaded map
            tpl_key = row.template_file.replace(".html", "")
            tpl = _template_map.get(tpl_key) or _template_map.get(row.template_file)
            if not tpl:
                failed += 1
                errors.append(f"Row {row.id}: template '{row.template_file}' not found")
                continue

            # Gather attachments from pre-loaded Document maps
            from app.services.storage import download_file as sb_download
            files_to_send: list[tuple] = []  # (bytes, original_name, mime_type)
            sender_docs = _sender_doc_map.get(current_sender, [])
            row_docs = _row_doc_map.get(str(row.id), [])
            all_docs = sender_docs + _global_docs + row_docs
            for doc in all_docs:
                try:
                    data = sb_download(doc.file_path)
                    files_to_send.append((data, doc.original_name, doc.mime_type))
                except Exception as e:
                    logger.warning(f"Could not download attachment {doc.file_path}: {e}")

            # Personalize template
            try:
                subject, body, image_to_embed = template_handler.personalize_template(
                    tpl.subject_line,
                    tpl.body_html,
                    recipient_name=row.recipient_name,
                    company=row.company,
                    position=row.position,
                    framework=row.framework,
                    my_strength=row.my_strength,
                    audience_value=row.audience_value,
                    your_name=personal["your_name"],
                    your_phone_number=personal["your_phone"],
                    your_email=current_sender,
                    your_city_and_state=personal["your_city_state"],
                    image_assets_folder=str(config.SELFIE_DIR),
                    template_file_name=row.template_file,
                    **(row.custom_fields or {}),
                )
            except Exception as e:
                failed += 1
                errors.append(f"Row {row.id}: template error: {e}")
                continue

            # Send
            try:
                if current_account.provider == "smtp":
                    email_sender.send_email(
                        server,
                        current_sender,
                        row.recipient_email,
                        subject,
                        body,
                        attachment_paths=files_to_send,
                        inline_image_path=image_to_embed,
                    )
                elif current_account.provider == "resend":
                    resend_key = get_secret(db, current_account.vault_secret_name)
                    email_sender.send_email_resend(
                        api_key=resend_key,
                        from_email=current_sender,
                        from_name=current_account.display_name,
                        to_email=row.recipient_email,
                        subject=subject,
                        html_body=body,
                        attachments=files_to_send,
                    )
                row.sent_status = "sent"
                row.sent_at = datetime.now(tz=timezone.utc)
                sent += 1
                jr.sent = sent
                db.commit()
                logger.info(f"Job {job_result_id}: sent to {row.recipient_email} (row {row.id})")

                # Publish per-email and job-level events
                _publish_event(job_result_id, "email_update", {
                    "job_id": job_result_id, "row_id": str(row.id),
                    "recipient_email": row.recipient_email,
                    "recipient_name": row.recipient_name or "",
                    "company": row.company or "",
                    "sent_status": "sent",
                    "sent_at": row.sent_at.isoformat() + "Z" if row.sent_at else None,
                })
                _publish_event(job_result_id, "job_update", {
                    "job_id": job_result_id, "status": "running",
                    "sent": sent, "failed": failed, "total": jr.total,
                })

                # Audit: email sent
                log_audit_bg(
                    user_id=row.user_id or "",
                    event_type="email.sent",
                    resource_type="email_column",
                    resource_id=str(row.id),
                    detail={"recipient": row.recipient_email, "job_id": job_result_id},
                )

                time.sleep(sleep_seconds)
            except Exception as e:
                row.sent_status = "failed"
                failed += 1
                jr.failed = failed
                jr.errors = errors + [f"Row {row.id}: send failed: {e}"]
                db.commit()
                errors.append(f"Row {row.id}: send failed: {e}")
                logger.error(f"Job {job_result_id}: failed row {row.id}: {e}")

                # Publish per-email and job-level events
                _publish_event(job_result_id, "email_update", {
                    "job_id": job_result_id, "row_id": str(row.id),
                    "recipient_email": row.recipient_email,
                    "recipient_name": row.recipient_name or "",
                    "company": row.company or "",
                    "sent_status": "failed",
                    "sent_at": None,
                })
                _publish_event(job_result_id, "job_update", {
                    "job_id": job_result_id, "status": "running",
                    "sent": sent, "failed": failed, "total": jr.total,
                })

                # Audit: email failed
                log_audit_bg(
                    user_id=row.user_id or "",
                    event_type="email.failed",
                    resource_type="email_column",
                    resource_id=str(row.id),
                    detail={"recipient": row.recipient_email, "job_id": job_result_id, "error": str(e)},
                )

        if server:
            try:
                server.quit()
            except Exception:
                pass

        # Finalize job result
        jr.sent = sent
        jr.failed = failed
        jr.errors = errors
        jr.status = "completed"
        jr.completed_at = datetime.now(tz=timezone.utc)
        db.commit()
        logger.info(f"Job {job_result_id}: completed — sent={sent}, failed={failed}")

        # Publish completion event
        _publish_event(job_result_id, "job_finished", {
            "job_id": job_result_id, "status": "completed",
            "sent": sent, "failed": failed, "total": jr.total,
            "completed_at": jr.completed_at.isoformat() + "Z",
        })

    except Exception as e:
        # Fatal error — update job result if possible
        try:
            jr = db.query(JobResult).get(job_result_id)
            if jr:
                jr.status = "error"
                jr.errors = (jr.errors or []) + [str(e)]
                jr.completed_at = datetime.now(tz=timezone.utc)
                db.commit()
                _publish_event(job_result_id, "job_finished", {
                    "job_id": job_result_id, "status": "error",
                    "sent": jr.sent, "failed": jr.failed, "total": jr.total,
                    "completed_at": jr.completed_at.isoformat() + "Z",
                })
        except Exception:
            pass
        logger.error(f"Job {job_result_id}: fatal error: {e}")
        raise
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Scheduler loop — polls the DB every 60 s for due rows                       #
# --------------------------------------------------------------------------- #

_scheduler_task: asyncio.Task | None = None
_bounce_task: asyncio.Task | None = None
_ooo_expire_task: asyncio.Task | None = None


async def _scheduler_loop():
    """Async loop: every 60 s, find rows with scheduled_at <= now and send."""
    logger.info("Scheduler loop started (60 s interval)")
    while True:
        try:
            await asyncio.sleep(60)
            _check_due_rows()
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
            break
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")


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
    """Cancel the scheduler, bounce, and OOO expire loops. Call during FastAPI lifespan shutdown."""
    global _scheduler_task, _bounce_task, _ooo_expire_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
    if _bounce_task and not _bounce_task.done():
        _bounce_task.cancel()
    if _ooo_expire_task and not _ooo_expire_task.done():
        _ooo_expire_task.cancel()
    logger.info("Background scheduler + bounce checker + OOO expirer stopped")
