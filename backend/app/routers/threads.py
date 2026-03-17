"""Threads router — email conversation tracking & follow-up management."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id, get_user_role, is_admin_role
from app.models.thread import EmailThread, ThreadMessage
from app.models.email_column import EmailColumn
from app.schemas.thread import (
    ThreadListItem,
    ThreadDetail,
    ThreadMessageOut,
    ThreadStats,
    ThreadStatusUpdate,
    ThreadSnooze,
)
from app.services.audit_service import log_audit_bg
from app.logging_config import get_logger

logger = get_logger("threads")

router = APIRouter(prefix="/api/threads", tags=["threads"])


# ─── List threads ─────────────────────────────────────────────────────── #

@router.get("/", response_model=list[ThreadListItem])
def list_threads(
    status: str | None = Query(None, description="Filter by thread status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """List email threads for the current user, newest-activity first."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)

    q = db.query(EmailThread)
    if not is_admin_role(role):
        q = q.filter(EmailThread.user_id == uid)
    if status:
        q = q.filter(EmailThread.status == status)

    threads = (
        q.order_by(EmailThread.last_activity_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for t in threads:
        # Denormalize some info from the campaign row
        recipient_name = None
        recipient_email = None
        company = None
        if t.campaign_row_id:
            row = db.query(EmailColumn).get(t.campaign_row_id)
            if row:
                recipient_name = row.recipient_name
                recipient_email = row.recipient_email
                company = row.company

        # Get latest message preview
        latest_msg = (
            db.query(ThreadMessage)
            .filter(ThreadMessage.thread_id == t.id)
            .order_by(ThreadMessage.sent_at.desc())
            .first()
        )
        latest_preview = ""
        if latest_msg:
            text = latest_msg.body_text or latest_msg.subject or ""
            latest_preview = text[:200]

        result.append(ThreadListItem(
            id=t.id,
            user_id=t.user_id,
            campaign_row_id=str(t.campaign_row_id) if t.campaign_row_id else None,
            subject=t.subject,
            status=t.status,
            reply_count=t.reply_count or 0,
            last_activity_at=t.last_activity_at,
            first_sent_at=t.first_sent_at,
            followup_due_at=t.followup_due_at,
            created_at=t.created_at,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            company=company,
            latest_message_preview=latest_preview,
        ))

    return result


# ─── Threads needing follow-up (static — must precede /{thread_id}) ─── #

@router.get("/needs-followup", response_model=list[ThreadListItem])
def needs_followup(
    limit: int = Query(50, ge=1, le=200),
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Get threads that need follow-up (overdue or due soon)."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    now = datetime.now(tz=timezone.utc)

    q = db.query(EmailThread).filter(
        EmailThread.status.in_(["needs_followup", "awaiting_reply"]),
        EmailThread.followup_due_at <= now + timedelta(days=1),  # Due within 24h
    )
    if not is_admin_role(role):
        q = q.filter(EmailThread.user_id == uid)

    threads = (
        q.order_by(EmailThread.followup_due_at.asc())
        .limit(limit)
        .all()
    )

    result = []
    for t in threads:
        recipient_name = None
        recipient_email = None
        company = None
        if t.campaign_row_id:
            row = db.query(EmailColumn).get(t.campaign_row_id)
            if row:
                recipient_name = row.recipient_name
                recipient_email = row.recipient_email
                company = row.company

        latest_msg = (
            db.query(ThreadMessage)
            .filter(ThreadMessage.thread_id == t.id)
            .order_by(ThreadMessage.sent_at.desc())
            .first()
        )
        latest_preview = ""
        if latest_msg:
            text = latest_msg.body_text or latest_msg.subject or ""
            latest_preview = text[:200]

        result.append(ThreadListItem(
            id=t.id,
            user_id=t.user_id,
            campaign_row_id=str(t.campaign_row_id) if t.campaign_row_id else None,
            subject=t.subject,
            status=t.status,
            reply_count=t.reply_count or 0,
            last_activity_at=t.last_activity_at,
            first_sent_at=t.first_sent_at,
            followup_due_at=t.followup_due_at,
            created_at=t.created_at,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            company=company,
            latest_message_preview=latest_preview,
        ))

    return result


# ─── Thread stats (static — must precede /{thread_id}) ───────────────── #

@router.get("/stats", response_model=ThreadStats)
def thread_stats(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Get aggregate thread statistics for the current user."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    now = datetime.now(tz=timezone.utc)

    q = db.query(
        func.count(EmailThread.id).label("total"),
        func.sum(case((EmailThread.status == "awaiting_reply", 1), else_=0)).label("awaiting"),
        func.sum(case((EmailThread.status == "replied", 1), else_=0)).label("replied"),
        func.sum(case((EmailThread.status == "needs_followup", 1), else_=0)).label("needs_followup"),
        func.sum(case((EmailThread.status == "closed", 1), else_=0)).label("closed"),
        func.sum(case((EmailThread.status == "sent", 1), else_=0)).label("sent"),
        func.sum(case((
            and_(
                EmailThread.followup_due_at <= now,
                EmailThread.status.in_(["awaiting_reply", "needs_followup"]),
            ), 1), else_=0)).label("overdue"),
    )
    if not is_admin_role(role):
        q = q.filter(EmailThread.user_id == uid)

    row = q.one()
    return ThreadStats(
        total=row.total or 0,
        awaiting_reply=row.awaiting or 0,
        replied=row.replied or 0,
        needs_followup=row.needs_followup or 0,
        closed=row.closed or 0,
        sent=row.sent or 0,
        overdue_followups=row.overdue or 0,
    )


# ─── Thread detail (dynamic — after all static routes) ───────────────── #

@router.get("/{thread_id}", response_model=ThreadDetail)
def get_thread(
    thread_id: str,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Get full thread with all messages."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)

    thread = db.query(EmailThread).get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not is_admin_role(role) and thread.user_id != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = (
        db.query(ThreadMessage)
        .filter(ThreadMessage.thread_id == thread_id)
        .order_by(ThreadMessage.sent_at.asc())
        .all()
    )

    # Denormalize campaign row info
    recipient_name = None
    recipient_email = None
    company = None
    if thread.campaign_row_id:
        row = db.query(EmailColumn).get(thread.campaign_row_id)
        if row:
            recipient_name = row.recipient_name
            recipient_email = row.recipient_email
            company = row.company

    return ThreadDetail(
        id=thread.id,
        user_id=thread.user_id,
        campaign_row_id=str(thread.campaign_row_id) if thread.campaign_row_id else None,
        subject=thread.subject,
        status=thread.status,
        reply_count=thread.reply_count or 0,
        last_activity_at=thread.last_activity_at,
        first_sent_at=thread.first_sent_at,
        followup_due_at=thread.followup_due_at,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        company=company,
        messages=[
            ThreadMessageOut(
                id=m.id,
                thread_id=str(m.thread_id),
                direction=m.direction,
                message_id=m.message_id,
                in_reply_to=m.in_reply_to,
                from_email=m.from_email,
                to_email=m.to_email,
                subject=m.subject,
                body_html=m.body_html,
                body_text=m.body_text,
                sent_at=m.sent_at,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


# ─── Update thread status ────────────────────────────────────────────── #

@router.put("/{thread_id}/status")
def update_status(
    thread_id: str,
    body: ThreadStatusUpdate,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Manually update a thread's status."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)

    thread = db.query(EmailThread).get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not is_admin_role(role) and thread.user_id != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    old_status = thread.status
    thread.status = body.status
    thread.last_activity_at = datetime.now(tz=timezone.utc)

    # Clear followup timer if closing
    if body.status == "closed":
        thread.followup_due_at = None

    db.commit()

    log_audit_bg(
        user_id=uid,
        event_type="thread.status_updated",
        resource_type="email_thread",
        resource_id=thread_id,
        detail={"old_status": old_status, "new_status": body.status},
    )

    return {"ok": True, "status": thread.status}


# ─── Snooze follow-up ────────────────────────────────────────────────── #

@router.post("/{thread_id}/snooze")
def snooze_thread(
    thread_id: str,
    body: ThreadSnooze,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Snooze a thread's follow-up timer by N days."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)

    thread = db.query(EmailThread).get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not is_admin_role(role) and thread.user_id != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    new_due = datetime.now(tz=timezone.utc) + timedelta(days=body.days)
    thread.followup_due_at = new_due
    thread.status = "awaiting_reply"  # Reset from needs_followup
    thread.last_activity_at = datetime.now(tz=timezone.utc)
    db.commit()

    log_audit_bg(
        user_id=uid,
        event_type="thread.snoozed",
        resource_type="email_thread",
        resource_id=thread_id,
        detail={"days": body.days, "new_due_at": new_due.isoformat()},
    )

    return {"ok": True, "followup_due_at": new_due.isoformat()}
