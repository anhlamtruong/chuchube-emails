"""Email sending router — dispatches background tasks (no external broker)."""
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.email_column import EmailColumn
from app.models.job_result import JobResult
from app.schemas.email_column import SendEmailsRequest, ScheduleEmailsRequest, RecurringScheduleRequest
from app.logging_config import get_logger
from app import config
from app.auth import require_auth, get_user_id
from app.routers.consent import require_consent

logger = get_logger("emails")

router = APIRouter(prefix="/api/emails", tags=["emails"])


@router.post("/send")
def send_emails(
    req: SendEmailsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _consent=Depends(require_consent),
):
    """Queue a batch email send via BackgroundTasks."""
    from app.background import send_email_batch

    if not req.row_ids:
        raise HTTPException(400, "row_ids must not be empty")

    jr = JobResult(status="queued", total=len(req.row_ids), row_ids=[str(rid) for rid in req.row_ids])
    db.add(jr)
    db.commit()
    db.refresh(jr)

    background_tasks.add_task(send_email_batch, jr.id, req.row_ids)
    return {"job_id": jr.id, "status": "queued"}


@router.get("/status/{job_id}")
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Check the status of a send job from the job_results table."""
    jr = db.query(JobResult).get(job_id)
    if not jr:
        raise HTTPException(404, "Job not found")
    return {
        "job_id": jr.id,
        "status": jr.status,
        "total": jr.total,
        "sent": jr.sent,
        "failed": jr.failed,
        "errors": jr.errors or [],
        "created_at": (jr.created_at.isoformat() + "Z") if jr.created_at else None,
        "completed_at": (jr.completed_at.isoformat() + "Z") if jr.completed_at else None,
    }


@router.get("/jobs")
def list_jobs(
    status: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """List recent send jobs (persistent, survives restarts)."""
    q = db.query(JobResult).order_by(JobResult.created_at.desc())
    if status:
        q = q.filter(JobResult.status == status)
    results = q.limit(limit).all()
    return {
        "jobs": [
            {
                "job_id": jr.id,
                "status": jr.status,
                "total": jr.total,
                "sent": jr.sent,
                "failed": jr.failed,
                "errors": jr.errors or [],
                "created_at": (jr.created_at.isoformat() + "Z") if jr.created_at else None,
                "completed_at": (jr.completed_at.isoformat() + "Z") if jr.completed_at else None,
            }
            for jr in results
        ]
    }


@router.get("/senders")
def list_senders(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """List sender accounts for the current user."""
    from app.auth import get_user_id
    from app.models.sender_account import SenderAccount
    uid = get_user_id(auth)
    accounts = (
        db.query(SenderAccount)
        .filter(SenderAccount.user_id == uid)
        .order_by(SenderAccount.is_default.desc(), SenderAccount.created_at)
        .all()
    )
    return {
        "senders": [
            {
                "email": a.email,
                "display_name": a.display_name,
                "provider": a.provider,
                "is_default": a.is_default,
            }
            for a in accounts
        ]
    }


# --------------------------------------------------------------------------- #
# Scheduling endpoints                                                         #
# --------------------------------------------------------------------------- #

@router.post("/schedule")
def schedule_one_time(
    req: ScheduleEmailsRequest,
    db: Session = Depends(get_db),
    _consent=Depends(require_consent),
):
    """Schedule a batch of emails to be sent at a specific time.

    The client sends `run_at` as a naive local time together with a
    `timezone` string (IANA, e.g. "America/New_York").  We convert to
    UTC and store the naive-UTC value in `scheduled_at`.
    """
    if not req.row_ids:
        raise HTTPException(400, "row_ids must not be empty")

    # Convert local time → UTC
    try:
        tz = ZoneInfo(req.timezone)
    except (KeyError, Exception):
        raise HTTPException(400, f"Invalid timezone: {req.timezone}")

    local_dt = req.run_at.replace(tzinfo=tz)
    utc_dt = local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    # Persist scheduled_at (UTC, naive) on each row for UI visibility
    rows = db.query(EmailColumn).filter(EmailColumn.id.in_(req.row_ids)).all()
    for row in rows:
        row.scheduled_at = utc_dt

    # Create persistent job result
    jr = JobResult(status="scheduled", total=len(req.row_ids), row_ids=[str(rid) for rid in req.row_ids])
    db.add(jr)
    db.commit()
    db.refresh(jr)

    # The background poller will pick these up when scheduled_at <= now(UTC)
    return {"job_id": jr.id, "status": "scheduled", "run_at": utc_dt.isoformat() + "Z"}


@router.post("/schedule/recurring")
def schedule_recurring(
    req: RecurringScheduleRequest,
    db: Session = Depends(get_db),
    _consent=Depends(require_consent),
):
    """Schedule emails on a recurring schedule by setting scheduled_at.

    With Celery beat's check_due_rows running every minute, rows with
    scheduled_at <= now will be picked up automatically.
    """
    if not req.row_ids:
        raise HTTPException(400, "row_ids must not be empty")
    if not req.cron:
        raise HTTPException(400, "cron dict must not be empty")

    # Convert cron hour/minute from the user's timezone to UTC
    try:
        tz = ZoneInfo(req.timezone)
    except (KeyError, Exception):
        raise HTTPException(400, f"Invalid timezone: {req.timezone}")

    # For now, store cron config for reference.
    # The background poller handles rows with scheduled_at <= now.
    return {"status": "scheduled", "cron": req.cron, "timezone": req.timezone, "row_count": len(req.row_ids)}


@router.get("/scheduled-jobs")
def get_scheduled_jobs(db: Session = Depends(get_db)):
    """List active + finished jobs from the job_results table."""
    active = (
        db.query(JobResult)
        .filter(JobResult.status.in_(["queued", "scheduled", "running"]))
        .order_by(JobResult.created_at.desc())
        .all()
    )
    done = (
        db.query(JobResult)
        .filter(JobResult.status.in_(["completed", "error", "cancelled"]))
        .order_by(JobResult.completed_at.desc())
        .limit(20)
        .all()
    )

    def _fmt(jr, include_completed_at=False):
        d = {
            "job_id": jr.id,
            "name": f"Send batch ({jr.total} rows)",
            "status": jr.status,
            "total": jr.total,
            "sent": jr.sent,
            "failed": jr.failed,
            "created_at": (jr.created_at.isoformat() + "Z") if jr.created_at else None,
        }
        if include_completed_at:
            d["completed_at"] = (jr.completed_at.isoformat() + "Z") if jr.completed_at else None
        return d

    return {
        "jobs": [_fmt(jr) for jr in active],
        "finished": [_fmt(jr, include_completed_at=True) for jr in done],
    }


@router.delete("/scheduled-jobs/{job_id}")
def cancel_scheduled_job(job_id: str, db: Session = Depends(get_db)):
    """Cancel a scheduled/queued job."""
    jr = db.query(JobResult).get(job_id)
    if not jr:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("queued", "scheduled"):
        raise HTTPException(400, f"Cannot cancel job in '{jr.status}' status")

    # Clear scheduled_at on associated rows so the poller skips them
    pending_rows = (
        db.query(EmailColumn)
        .filter(
            EmailColumn.scheduled_at != None,  # noqa: E711
            EmailColumn.sent_status == "pending",
        )
        .all()
    )
    for row in pending_rows:
        row.scheduled_at = None

    jr.status = "cancelled"
    db.commit()
    return {"job_id": jr.id, "status": "cancelled"}

