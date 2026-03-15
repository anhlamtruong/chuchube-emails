"""Email sending router — dispatches background tasks (no external broker)."""
import asyncio
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from app.database import get_db, SessionLocal
from app.models.email_column import EmailColumn
from app.models.job_result import JobResult
from app.models.user_profile import UserProfile
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.schemas.email_column import SendEmailsRequest, ScheduleEmailsRequest
from app.logging_config import get_logger
from app import config
from app.auth import require_auth, get_user_id, get_user_role, is_admin_role, verify_clerk_token
from app.routers.consent import require_consent

from app.rate_limit import limiter

logger = get_logger("emails")

router = APIRouter(prefix="/api/emails", tags=["emails"])

# Separate SSE router — uses query-param auth (EventSource can't set headers)
sse_router = APIRouter(prefix="/api/emails", tags=["emails-sse"])


def _upsert_user_profile(auth: dict, db: Session) -> None:
    """Cache user_id → email mapping from the Clerk JWT for admin views."""
    uid = get_user_id(auth)
    email = auth.get("email") or auth.get("email_address")
    name = auth.get("name") or auth.get("first_name")

    existing = db.query(UserProfile).get(uid)
    if existing:
        if email and existing.email != email:
            existing.email = email
        if name and existing.name != name:
            existing.name = name
        existing.last_seen_at = datetime.now(timezone.utc)
    else:
        db.add(UserProfile(user_id=uid, email=email, name=name))
    db.commit()


@router.post("/send")
@limiter.limit("30/minute")
def send_emails(
    req: SendEmailsRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
    _consent=Depends(require_consent),
):
    """Queue a batch email send via BackgroundTasks."""
    from app.background import send_email_batch
    uid = get_user_id(auth)
    _upsert_user_profile(auth, db)

    if not req.row_ids:
        raise HTTPException(400, "row_ids must not be empty")

    # Verify row ownership
    owned = db.query(EmailColumn.id).filter(
        EmailColumn.id.in_(req.row_ids), EmailColumn.user_id == uid
    ).all()
    owned_ids = {str(r.id) for r in owned}
    if len(owned_ids) != len(req.row_ids):
        raise HTTPException(403, "Some row_ids do not belong to you")

    jr = JobResult(status="queued", total=len(req.row_ids), row_ids=[str(rid) for rid in req.row_ids], user_id=uid)
    db.add(jr)
    db.commit()
    db.refresh(jr)

    background_tasks.add_task(send_email_batch, jr.id, req.row_ids)
    return {"job_id": jr.id, "status": "queued"}


@router.get("/status/{job_id}")
def get_job_status(job_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Check the status of a send job from the job_results table."""
    uid = get_user_id(auth)
    jr = db.query(JobResult).get(job_id)
    if not jr or jr.user_id != uid:
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
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """List recent send jobs (persistent, survives restarts)."""
    uid = get_user_id(auth)
    q = db.query(JobResult).filter(JobResult.user_id == uid).order_by(JobResult.created_at.desc())
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
@limiter.limit("30/minute")
def schedule_one_time(
    req: ScheduleEmailsRequest,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
    _consent=Depends(require_consent),
):
    """Schedule a batch of emails to be sent at a specific time.

    The client sends `run_at` as a naive local time together with a
    `timezone` string (IANA, e.g. "America/New_York").  We convert to
    UTC and store the naive-UTC value in `scheduled_at`.
    """
    uid = get_user_id(auth)
    _upsert_user_profile(auth, db)
    if not req.row_ids:
        raise HTTPException(400, "row_ids must not be empty")

    # Verify row ownership
    owned = db.query(EmailColumn.id).filter(
        EmailColumn.id.in_(req.row_ids), EmailColumn.user_id == uid
    ).all()
    if len(owned) != len(req.row_ids):
        raise HTTPException(403, "Some row_ids do not belong to you")

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
    jr = JobResult(status="scheduled", total=len(req.row_ids), row_ids=[str(rid) for rid in req.row_ids], user_id=uid, scheduled_at=utc_dt)
    db.add(jr)
    db.commit()
    db.refresh(jr)

    # The background poller will pick these up when scheduled_at <= now(UTC)
    return {"job_id": jr.id, "status": "scheduled", "run_at": utc_dt.isoformat() + "Z"}


@router.get("/scheduled-jobs")
def get_scheduled_jobs(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """List active + finished jobs from the job_results table."""
    uid = get_user_id(auth)
    active = (
        db.query(JobResult)
        .filter(JobResult.user_id == uid, JobResult.status.in_(["queued", "scheduled", "running"]))
        .order_by(JobResult.created_at.desc())
        .all()
    )
    done = (
        db.query(JobResult)
        .filter(JobResult.user_id == uid, JobResult.status.in_(["completed", "error", "cancelled", "stale"]))
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
            "scheduled_at": (jr.scheduled_at.isoformat() + "Z") if jr.scheduled_at else None,
        }
        if include_completed_at:
            d["completed_at"] = (jr.completed_at.isoformat() + "Z") if jr.completed_at else None
        return d

    return {
        "jobs": [_fmt(jr) for jr in active],
        "finished": [_fmt(jr, include_completed_at=True) for jr in done],
    }


@router.delete("/scheduled-jobs/{job_id}")
def cancel_scheduled_job(job_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Cancel a scheduled/queued job."""
    uid = get_user_id(auth)
    jr = db.query(JobResult).get(job_id)
    if not jr or jr.user_id != uid:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("queued", "scheduled"):
        raise HTTPException(400, f"Cannot cancel job in '{jr.status}' status")

    # Clear scheduled_at only on rows belonging to THIS job
    if jr.row_ids:
        job_row_ids = [str(rid) for rid in jr.row_ids]
        pending_rows = (
            db.query(EmailColumn)
            .filter(
                EmailColumn.id.in_(job_row_ids),
                EmailColumn.sent_status == "pending",
            )
            .all()
        )
        for row in pending_rows:
            row.scheduled_at = None

    jr.status = "cancelled"
    db.commit()
    return {"job_id": jr.id, "status": "cancelled"}


# --------------------------------------------------------------------------- #
# Rerun / Reschedule endpoints                                                 #
# --------------------------------------------------------------------------- #

class RescheduleJobRequest(BaseModel):
    run_at: datetime
    timezone: str = "UTC"


@router.post("/jobs/{job_id}/rerun")
@limiter.limit("30/minute")
def rerun_job(
    job_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Rerun a failed/stale/error job by creating a new job with unsent rows.

    Only rows that are 'pending' or 'failed' are included in the new job.
    Already-sent rows are skipped. The new job dispatches immediately.
    """
    from app.background import send_email_batch
    uid = get_user_id(auth)
    _upsert_user_profile(auth, db)

    jr = db.query(JobResult).get(job_id)
    if not jr or jr.user_id != uid:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("error", "stale", "completed", "cancelled"):
        raise HTTPException(
            400,
            f"Cannot rerun job in '{jr.status}' status. "
            f"Only error, stale, completed, or cancelled jobs can be rerun.",
        )

    if not jr.row_ids:
        raise HTTPException(400, "Job has no row_ids to rerun")

    # Get rows that can be retried (pending or failed)
    retryable_rows = (
        db.query(EmailColumn)
        .filter(
            EmailColumn.id.in_([str(rid) for rid in jr.row_ids]),
            EmailColumn.sent_status.in_(["pending", "failed"]),
            EmailColumn.user_id == uid,
        )
        .all()
    )
    if not retryable_rows:
        raise HTTPException(400, "No retryable rows found (all already sent)")

    # Reset rows to pending
    for row in retryable_rows:
        row.sent_status = "pending"
        row.sent_at = None
        row.scheduled_at = None

    row_ids = [str(r.id) for r in retryable_rows]

    # Create new job linked to the parent
    new_jr = JobResult(
        status="queued",
        total=len(row_ids),
        row_ids=row_ids,
        user_id=uid,
        parent_job_id=jr.id,
    )
    db.add(new_jr)
    db.commit()
    db.refresh(new_jr)

    background_tasks.add_task(send_email_batch, new_jr.id, row_ids)
    return {
        "job_id": new_jr.id,
        "status": "queued",
        "total": len(row_ids),
        "parent_job_id": jr.id,
    }


@router.post("/jobs/{job_id}/reschedule")
@limiter.limit("30/minute")
def reschedule_job(
    job_id: str,
    req: RescheduleJobRequest,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Reschedule a failed/stale/error job at a new time.

    Creates a new scheduled JobResult targeting unsent rows from the
    original job. The background poller will pick it up.
    """
    uid = get_user_id(auth)
    _upsert_user_profile(auth, db)

    jr = db.query(JobResult).get(job_id)
    if not jr or jr.user_id != uid:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("error", "stale", "completed", "cancelled"):
        raise HTTPException(
            400,
            f"Cannot reschedule job in '{jr.status}' status. "
            f"Only error, stale, completed, or cancelled jobs can be rescheduled.",
        )

    if not jr.row_ids:
        raise HTTPException(400, "Job has no row_ids to reschedule")

    # Convert local time → UTC
    try:
        tz = ZoneInfo(req.timezone)
    except (KeyError, Exception):
        raise HTTPException(400, f"Invalid timezone: {req.timezone}")

    local_dt = req.run_at.replace(tzinfo=tz)
    utc_dt = local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    # Get rows that can be retried
    retryable_rows = (
        db.query(EmailColumn)
        .filter(
            EmailColumn.id.in_([str(rid) for rid in jr.row_ids]),
            EmailColumn.sent_status.in_(["pending", "failed"]),
            EmailColumn.user_id == uid,
        )
        .all()
    )
    if not retryable_rows:
        raise HTTPException(400, "No retryable rows found (all already sent)")

    # Reset rows and set scheduled_at
    for row in retryable_rows:
        row.sent_status = "pending"
        row.sent_at = None
        row.scheduled_at = utc_dt

    row_ids = [str(r.id) for r in retryable_rows]

    new_jr = JobResult(
        status="scheduled",
        total=len(row_ids),
        row_ids=row_ids,
        user_id=uid,
        scheduled_at=utc_dt,
        parent_job_id=jr.id,
    )
    db.add(new_jr)
    db.commit()
    db.refresh(new_jr)

    return {
        "job_id": new_jr.id,
        "status": "scheduled",
        "run_at": utc_dt.isoformat() + "Z",
        "total": len(row_ids),
        "parent_job_id": jr.id,
    }


# --------------------------------------------------------------------------- #
# Clone job endpoint                                                           #
# --------------------------------------------------------------------------- #

@router.post("/jobs/{job_id}/clone")
@limiter.limit("30/minute")
def clone_job(
    job_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Clone ALL rows from a finished job into fresh pending copies and send immediately.

    Unlike rerun (which retries only failed/unsent rows in-place), this creates
    brand-new EmailColumn rows — leaving the originals untouched — and dispatches
    a new job to send the entire batch again.
    """
    from app.background import send_email_batch
    uid = get_user_id(auth)
    _upsert_user_profile(auth, db)

    jr = db.query(JobResult).get(job_id)
    if not jr or jr.user_id != uid:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("error", "stale", "completed", "cancelled"):
        raise HTTPException(
            400,
            f"Cannot clone job in '{jr.status}' status. "
            f"Only completed, error, stale, or cancelled jobs can be cloned.",
        )
    if not jr.row_ids:
        raise HTTPException(400, "Job has no rows to clone")

    # Load ALL original rows (including already-sent ones)
    original_rows = (
        db.query(EmailColumn)
        .filter(
            EmailColumn.id.in_([str(rid) for rid in jr.row_ids]),
            EmailColumn.user_id == uid,
        )
        .all()
    )
    if not original_rows:
        raise HTTPException(400, "No rows found for this job")

    # Clone each row as a fresh pending copy
    new_rows = []
    for orig in original_rows:
        clone = EmailColumn(
            sender_email=orig.sender_email,
            recipient_name=orig.recipient_name,
            recipient_email=orig.recipient_email,
            company=orig.company,
            position=orig.position,
            template_file=orig.template_file,
            framework=orig.framework,
            my_strength=orig.my_strength,
            audience_value=orig.audience_value,
            custom_fields=orig.custom_fields,
            sent_status="pending",
            sent_at=None,
            scheduled_at=None,
            recruiter_id=orig.recruiter_id,
            referral_id=orig.referral_id,
            user_id=orig.user_id,
        )
        new_rows.append(clone)

    db.add_all(new_rows)
    db.flush()  # assign IDs
    new_row_ids = [str(r.id) for r in new_rows]

    # Create job linked to parent
    new_jr = JobResult(
        status="queued",
        total=len(new_row_ids),
        row_ids=new_row_ids,
        user_id=uid,
        parent_job_id=jr.id,
    )
    db.add(new_jr)
    db.commit()
    db.refresh(new_jr)

    background_tasks.add_task(send_email_batch, new_jr.id, new_row_ids)
    return {
        "job_id": new_jr.id,
        "status": "queued",
        "total": len(new_row_ids),
        "parent_job_id": jr.id,
    }


# --------------------------------------------------------------------------- #
# Job detail endpoint                                                          #
# --------------------------------------------------------------------------- #

@router.get("/jobs/{job_id}/detail")
def get_job_detail(job_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Get full job detail including per-email status for the Job Detail page."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    jr = db.query(JobResult).get(job_id)
    if not jr:
        raise HTTPException(404, "Job not found")
    # Admin can view any job; regular user can only view own
    if not is_admin_role(role) and jr.user_id != uid:
        raise HTTPException(404, "Job not found")

    # Resolve owner email for admin badge
    owner_email = None
    if is_admin_role(role) and jr.user_id:
        from app.models.user_profile import UserProfile
        profile = db.query(UserProfile).get(jr.user_id)
        owner_email = profile.email if profile else jr.user_id

    emails = []
    if jr.row_ids:
        rows = (
            db.query(EmailColumn)
            .filter(EmailColumn.id.in_([str(rid) for rid in jr.row_ids]))
            .all()
        )
        # Build a map to preserve original order from row_ids
        row_map = {str(r.id): r for r in rows}
        for rid in jr.row_ids:
            r = row_map.get(str(rid))
            if r:
                emails.append({
                    "id": str(r.id),
                    "recipient_name": r.recipient_name or "",
                    "recipient_email": r.recipient_email or "",
                    "company": r.company or "",
                    "position": r.position or "",
                    "sender_email": r.sender_email or "",
                    "template_file": r.template_file or "",
                    "sent_status": r.sent_status or "pending",
                    "sent_at": (r.sent_at.isoformat() + "Z") if r.sent_at else None,
                })

    return {
        "job_id": jr.id,
        "status": jr.status,
        "total": jr.total,
        "sent": jr.sent,
        "failed": jr.failed,
        "errors": jr.errors or [],
        "created_at": (jr.created_at.isoformat() + "Z") if jr.created_at else None,
        "scheduled_at": (jr.scheduled_at.isoformat() + "Z") if jr.scheduled_at else None,
        "completed_at": (jr.completed_at.isoformat() + "Z") if jr.completed_at else None,
        "parent_job_id": jr.parent_job_id,
        "emails": emails,
        "owner_email": owner_email,
    }


# --------------------------------------------------------------------------- #
# OOO re-send suggestions                                                      #
# --------------------------------------------------------------------------- #

@router.get("/ooo-resendable")
def ooo_resendable(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Return sent emails whose recipient is currently OOO and was emailed before their return date.

    This helps users identify emails that were likely missed due to OOO and
    suggests re-sending after the contact returns.
    """
    uid = get_user_id(auth)

    results = []

    # Search EmailColumn rows that were sent by this user, linked to an OOO contact
    for ContactModel, fk_field in [(Recruiter, "recruiter_id"), (Referral, "referral_id")]:
        fk_col = getattr(EmailColumn, fk_field)
        rows = (
            db.query(EmailColumn, ContactModel)
            .join(ContactModel, fk_col == ContactModel.id)
            .filter(
                EmailColumn.user_id == uid,
                EmailColumn.sent_status == "sent",
                ContactModel.email_status == "ooo",
                ContactModel.ooo_return_date != None,  # noqa: E711
            )
            .all()
        )
        for ec, contact in rows:
            results.append({
                "email_column_id": str(ec.id),
                "recipient_name": ec.recipient_name,
                "recipient_email": ec.recipient_email,
                "company": ec.company or contact.company,
                "sender_email": ec.sender_email,
                "template_file": ec.template_file,
                "sent_at": ec.sent_at.isoformat() + "Z" if ec.sent_at else None,
                "ooo_return_date": contact.ooo_return_date.isoformat() if contact.ooo_return_date else None,
                "contact_type": "recruiter" if fk_field == "recruiter_id" else "referral",
                "contact_id": str(contact.id),
            })

    # Sort by OOO return date ascending (soonest returns first)
    results.sort(key=lambda r: r["ooo_return_date"] or "")
    return results


# --------------------------------------------------------------------------- #
# SSE streams for real-time progress                                           #
# --------------------------------------------------------------------------- #

def _verify_sse_token(token: str) -> tuple[str, bool]:
    """Verify a Clerk JWT passed as a query param. Returns (user_id, is_admin).

    Delegates to the shared helper in app.services.sse_auth.
    """
    from app.services.sse_auth import verify_sse_token
    return verify_sse_token(token)


@sse_router.get("/jobs/{job_id}/stream")
async def job_stream(request: Request, job_id: str, token: str = Query(...)):
    """SSE stream of per-email + job-level events for a specific job.

    Uses token query param since EventSource cannot set headers.
    """
    uid, admin = _verify_sse_token(token)

    # Verify the job belongs to this user (admin can access any)
    db = SessionLocal()
    try:
        jr = db.query(JobResult).get(job_id)
        if not jr:
            raise HTTPException(404, "Job not found")
        if not admin and jr.user_id != uid:
            raise HTTPException(404, "Job not found")
        is_terminal = jr.status in ("completed", "error", "cancelled", "stale")
    finally:
        db.close()

    # If job is already done, send a single finished event and close
    if is_terminal:
        async def done_gen():
            yield {
                "event": "job_finished",
                "data": json.dumps({
                    "job_id": job_id, "status": jr.status,
                    "sent": jr.sent, "failed": jr.failed, "total": jr.total,
                    "completed_at": (jr.completed_at.isoformat() + "Z") if jr.completed_at else None,
                }),
            }
        return EventSourceResponse(done_gen())

    from app.background import subscribe_job, unsubscribe_job
    q = subscribe_job(job_id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"]),
                    }
                    # Close the stream once the job is finished
                    if event["event"] == "job_finished":
                        break
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection timeout
                    yield {"comment": "keepalive"}
        finally:
            unsubscribe_job(job_id, q)

    return EventSourceResponse(event_generator())


@sse_router.get("/jobs/stream")
async def global_job_stream(request: Request, token: str = Query(...)):
    """SSE stream of job-level events for all jobs belonging to the user.

    Lightweight — only sends job_update, job_started, and job_finished events
    (no per-email detail). Powers ScheduledJobsPage and Dashboard live updates.
    Admin users receive events for ALL jobs (no ownership filter).
    """
    uid, admin = _verify_sse_token(token)

    from app.background import subscribe_global, unsubscribe_global
    q = subscribe_global()

    # Pre-load the set of job IDs owned by this user to avoid a DB query per
    # event.  Refresh periodically so new jobs are picked up.
    import time as _time

    def _load_user_job_ids(user_id: str) -> set[str]:
        db = SessionLocal()
        try:
            ids = db.query(JobResult.id).filter(JobResult.user_id == user_id).all()
            return {str(r[0]) for r in ids}
        finally:
            db.close()

    _user_jobs = set() if admin else _load_user_job_ids(uid)
    _last_refresh = _time.monotonic()
    _REFRESH_INTERVAL = 30  # seconds

    async def event_generator():
        nonlocal _user_jobs, _last_refresh
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    # Admin sees all events; regular users only see their own
                    if not admin:
                        # Refresh the cache periodically
                        now = _time.monotonic()
                        if now - _last_refresh > _REFRESH_INTERVAL:
                            _user_jobs = _load_user_job_ids(uid)
                            _last_refresh = now
                        job_id = event.get("data", {}).get("job_id")
                        if job_id and str(job_id) not in _user_jobs:
                            # Also add to cache on-the-fly for newly started jobs
                            continue
                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"]),
                    }
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
        finally:
            unsubscribe_global(q)

    return EventSourceResponse(event_generator())

