"""Background tasks — email sending & DB-based scheduling.

No external broker needed. Uses FastAPI BackgroundTasks for immediate sends
and an asyncio loop for polling scheduled rows from the database.
"""
import asyncio
import os
import time
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
from app import config
from app.logging_config import get_logger

logger = get_logger("background")


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

        rows = db.query(EmailColumn).filter(EmailColumn.id.in_(row_ids)).all()
        jr.total = len(rows)
        db.commit()

        personal = get_personal_info(db)
        smtp_settings = get_smtp_settings(db)
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

            # Load template
            tpl = db.query(Template).filter(
                Template.name == row.template_file.replace(".html", "")
            ).first()
            if not tpl:
                tpl = db.query(Template).filter(Template.name == row.template_file).first()
            if not tpl:
                failed += 1
                errors.append(f"Row {row.id}: template '{row.template_file}' not found")
                continue

            # Gather attachments from Supabase Storage
            from app.services.storage import download_file as sb_download
            files_to_send: list[tuple] = []  # (bytes, original_name, mime_type)
            all_docs = []
            global_docs = db.query(Document).filter(Document.scope == "global", Document.user_id == row.user_id).all()
            sender_docs = db.query(Document).filter(
                Document.scope == "sender", Document.scope_ref == current_sender, Document.user_id == row.user_id
            ).all()
            row_docs = db.query(Document).filter(
                Document.scope == "campaign_row", Document.scope_ref == str(row.id)
            ).all()
            # sender docs first, then global, then row-specific
            all_docs = sender_docs + global_docs + row_docs
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
                time.sleep(sleep_seconds)
            except Exception as e:
                row.sent_status = "failed"
                failed += 1
                jr.failed = failed
                jr.errors = errors + [f"Row {row.id}: send failed: {e}"]
                db.commit()
                errors.append(f"Row {row.id}: send failed: {e}")
                logger.error(f"Job {job_result_id}: failed row {row.id}: {e}")

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

    except Exception as e:
        # Fatal error — update job result if possible
        try:
            jr = db.query(JobResult).get(job_result_id)
            if jr:
                jr.status = "error"
                jr.errors = (jr.errors or []) + [str(e)]
                jr.completed_at = datetime.now(tz=timezone.utc)
                db.commit()
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


def _check_due_rows():
    """Find scheduled JobResults whose rows are due and dispatch send jobs."""
    import threading
    db = SessionLocal()
    try:
        now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

        # Find all "scheduled" jobs that have stored row_ids
        scheduled_jobs = (
            db.query(JobResult)
            .filter(JobResult.status == "scheduled", JobResult.row_ids != None)  # noqa: E711
            .all()
        )
        if not scheduled_jobs:
            return

        for jr in scheduled_jobs:
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

            t = threading.Thread(target=send_email_batch, args=(jr.id, row_ids), daemon=True)
            t.start()
    finally:
        db.close()


def start_scheduler(app=None):
    """Start the background scheduler loop. Call during FastAPI lifespan startup."""
    global _scheduler_task
    loop = asyncio.get_event_loop()
    _scheduler_task = loop.create_task(_scheduler_loop())
    logger.info("Background scheduler registered")


def stop_scheduler():
    """Cancel the scheduler loop. Call during FastAPI lifespan shutdown."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("Background scheduler stopped")
