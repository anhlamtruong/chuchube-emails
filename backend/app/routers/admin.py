"""Admin-only router — access key management, org account overview, approval workflow, role management.

Endpoints gated by role: master_admin or admin (some master_admin only).
"""
import secrets
import bcrypt
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, func as sa_func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id, get_user_role, is_admin_role, invalidate_role_cache
from app.models.access_key import AccessKey
from app.models.user_role import UserRole
from app.models.sender_account import SenderAccount
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.job_result import JobResult
from app.models.user_profile import UserProfile
from app.models.email_column import EmailColumn
from app.schemas.access_key import AccessKeyCreate, AccessKeyOut, AccessKeyCreated
from app.schemas.user_role import UserRoleCreate, UserRoleUpdate, UserRoleOut
from app.logging_config import get_logger

logger = get_logger("admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Dependency — master_admin or admin can access these endpoints."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    if not is_admin_role(role):
        raise HTTPException(403, "Admin access required")
    return auth


def require_master_admin(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Dependency — only master_admin can access these endpoints."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    if role != "master_admin":
        raise HTTPException(403, "Master admin access required")
    return auth


# ─── Access Keys ───────────────────────────────────────────────────────── #

@router.get("/access-keys", response_model=list[AccessKeyOut])
def list_access_keys(
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all access keys."""
    return (
        db.query(AccessKey)
        .order_by(AccessKey.created_at.desc())
        .all()
    )


@router.post("/access-keys", response_model=AccessKeyCreated, status_code=201)
def generate_access_key(
    data: AccessKeyCreate,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Generate a new single-use access key.

    The plaintext key is returned ONCE in the response body.
    Only the bcrypt hash is persisted.
    """
    key_value = secrets.token_hex(16)  # 32-char hex string
    key_hash = bcrypt.hashpw(key_value.encode(), bcrypt.gensalt()).decode()
    key_prefix = key_value[:8]
    ak = AccessKey(key_hash=key_hash, key_prefix=key_prefix, label=data.label)
    db.add(ak)
    db.commit()
    db.refresh(ak)
    logger.info(f"Admin generated access key {ak.id} prefix={key_prefix} label='{data.label}'")

    # Send email notification if requested
    email_sent = False
    if data.notify_email:
        try:
            from app.services.email_sender import send_access_key_notification
            admin_uid = get_user_id(auth)
            email_sent = send_access_key_notification(
                recipient_email=data.notify_email,
                access_key=key_value,
                role=data.label or "user",
                assigned_by=admin_uid,
            )
        except Exception as e:
            logger.error(f"Failed to send key notification: {e}")

    # Return the plaintext key once — it is NOT stored
    return AccessKeyCreated(
        id=ak.id,
        key=key_value,
        key_prefix=key_prefix,
        label=ak.label,
        created_at=ak.created_at,
        is_active=ak.is_active,
    )


@router.delete("/access-keys/{key_id}")
def revoke_access_key(
    key_id: str,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Revoke (deactivate) an access key."""
    ak = db.query(AccessKey).get(key_id)
    if not ak:
        raise HTTPException(404, "Access key not found")
    ak.is_active = False
    db.commit()
    logger.info(f"Admin revoked access key {key_id}")
    return {"status": "revoked"}


# ─── Org Accounts (cross-user) ────────────────────────────────────────── #

@router.get("/org-accounts")
def list_org_accounts(
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all sender accounts that have organization data (cross-user)."""
    accounts = (
        db.query(SenderAccount)
        .filter(SenderAccount.organization_name.isnot(None))
        .order_by(SenderAccount.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "email": a.email,
            "display_name": a.display_name,
            "provider": a.provider,
            "organization_name": a.organization_name,
            "organization_type": a.organization_type,
            "title": a.title,
            "city": a.city,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in accounts
    ]


# ─── Admin check endpoint ─────────────────────────────────────────────── #

@router.get("/check")
def check_admin(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Check if the current user is an admin. Returns {is_admin, role}."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    return {"is_admin": is_admin_role(role), "role": role}


# ─── Approval Workflow ─────────────────────────────────────────────────── #

class ApprovalAction(BaseModel):
    ids: list[str]
    action: str  # "approve" or "reject"


@router.get("/pending-recruiters")
def list_pending_recruiters(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """List all recruiters pending admin approval."""
    rows = db.query(Recruiter).filter(Recruiter.approval_status == "pending").order_by(Recruiter.created_at.desc()).all()
    from app.schemas.recruiter import RecruiterOut
    return {"items": [RecruiterOut.model_validate(r, from_attributes=True) for r in rows], "total": len(rows)}


@router.get("/pending-referrals")
def list_pending_referrals(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """List all referrals pending admin approval."""
    rows = db.query(Referral).filter(Referral.approval_status == "pending").order_by(Referral.created_at.desc()).all()
    from app.schemas.referral import ReferralOut
    return {"items": [ReferralOut.model_validate(r, from_attributes=True) for r in rows], "total": len(rows)}


@router.post("/approve-recruiters")
def approve_recruiters(body: ApprovalAction, auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Approve or reject pending recruiters."""
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    new_status = "approved" if body.action == "approve" else "rejected"
    updated = db.query(Recruiter).filter(
        Recruiter.id.in_(body.ids),
        Recruiter.approval_status == "pending",
    ).update({"approval_status": new_status}, synchronize_session=False)
    db.commit()
    return {"updated": updated, "new_status": new_status}


@router.post("/approve-referrals")
def approve_referrals(body: ApprovalAction, auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Approve or reject pending referrals."""
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    new_status = "approved" if body.action == "approve" else "rejected"
    updated = db.query(Referral).filter(
        Referral.id.in_(body.ids),
        Referral.approval_status == "pending",
    ).update({"approval_status": new_status}, synchronize_session=False)
    db.commit()
    return {"updated": updated, "new_status": new_status}


# ─── User Role Management (master_admin only) ─────────────────────────── #

@router.get("/users", response_model=list[UserRoleOut])
def list_user_roles(
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """List all user roles. Master admin only."""
    return (
        db.query(UserRole)
        .order_by(UserRole.created_at.desc())
        .all()
    )


@router.post("/users", response_model=UserRoleOut, status_code=201)
def create_user_role(
    data: UserRoleCreate,
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """Assign a role to a user. Master admin only.

    The user_id should be the Clerk user ID (e.g. user_xxx).
    """
    # Check if user already has a role
    existing = db.query(UserRole).filter(UserRole.user_id == data.user_id).first()
    if existing:
        raise HTTPException(409, f"User {data.user_id} already has a role assignment. Use PUT to update.")

    admin_uid = get_user_id(auth)
    ur = UserRole(
        user_id=data.user_id,
        email=data.email,
        role=data.role,
        assigned_by=admin_uid,
    )
    db.add(ur)
    db.commit()
    db.refresh(ur)
    invalidate_role_cache(data.user_id)
    logger.info(f"Master admin {admin_uid} assigned role '{data.role}' to user {data.user_id}")
    return ur


@router.put("/users/{user_id}", response_model=UserRoleOut)
def update_user_role(
    user_id: str,
    data: UserRoleUpdate,
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """Update a user's role. Master admin only. Cannot change master_admin roles."""
    ur = db.query(UserRole).filter(UserRole.user_id == user_id).first()
    if not ur:
        raise HTTPException(404, "User role not found")
    if ur.role == "master_admin":
        raise HTTPException(403, "Cannot modify master_admin role")

    admin_uid = get_user_id(auth)
    old_role = ur.role
    ur.role = data.role
    ur.assigned_by = admin_uid
    db.commit()
    db.refresh(ur)
    invalidate_role_cache(user_id)
    logger.info(f"Master admin {admin_uid} changed user {user_id} role: {old_role} -> {data.role}")
    return ur


@router.delete("/users/{user_id}")
def delete_user_role(
    user_id: str,
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """Remove a user's role assignment. Master admin only. Cannot remove master_admin."""
    ur = db.query(UserRole).filter(UserRole.user_id == user_id).first()
    if not ur:
        raise HTTPException(404, "User role not found")
    if ur.role == "master_admin":
        raise HTTPException(403, "Cannot remove master_admin role")

    admin_uid = get_user_id(auth)
    db.delete(ur)
    db.commit()
    invalidate_role_cache(user_id)
    logger.info(f"Master admin {admin_uid} removed role for user {user_id}")
    return {"status": "deleted"}


# ─── Admin Job Management ─────────────────────────────────────────────── #

@router.get("/jobs")
def admin_list_jobs(
    status: str | None = Query(None, description="Filter by status"),
    user_id: str | None = Query(None, description="Filter by user_id"),
    search: str | None = Query(None, description="Search user email, recipient, sender"),
    date_from: str | None = Query(None, description="Filter from date (ISO)"),
    date_to: str | None = Query(None, description="Filter to date (ISO)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """List all jobs across all users with filters. Admin only.

    Returns paginated results with user_email from user_profiles cache.
    """
    q = (
        db.query(JobResult, UserProfile.email)
        .outerjoin(UserProfile, JobResult.user_id == UserProfile.user_id)
    )

    if status:
        q = q.filter(JobResult.status == status)
    if user_id:
        q = q.filter(JobResult.user_id == user_id)
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            q = q.filter(JobResult.created_at >= dt)
        except ValueError:
            raise HTTPException(400, "Invalid date_from format. Use ISO 8601 (e.g. 2026-01-01T00:00:00Z).")
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            q = q.filter(JobResult.created_at <= dt)
        except ValueError:
            raise HTTPException(400, "Invalid date_to format. Use ISO 8601 (e.g. 2026-12-31T23:59:59Z).")

    # Search: look in user_profiles.email AND in email_column recipient/sender
    if search:
        search_lower = f"%{search.lower()}%"
        # First try matching user email
        matching_user_ids = [
            uid for (uid,) in
            db.query(UserProfile.user_id)
            .filter(sa_func.lower(UserProfile.email).like(search_lower))
            .all()
        ]
        # Also search in email_column for recipient/sender matches
        matching_job_ids_from_emails = set()
        email_rows = (
            db.query(EmailColumn.id, EmailColumn.recipient_email, EmailColumn.sender_email)
            .filter(
                or_(
                    sa_func.lower(EmailColumn.recipient_email).like(search_lower),
                    sa_func.lower(EmailColumn.sender_email).like(search_lower),
                )
            )
            .all()
        )
        if email_rows:
            email_row_ids = {str(r.id) for r in email_rows}
            # Find jobs that contain these row_ids (JSON array search)
            all_jobs_with_rows = db.query(JobResult.id, JobResult.row_ids).filter(JobResult.row_ids.isnot(None)).all()
            for jr_id, row_ids in all_jobs_with_rows:
                if row_ids and any(str(rid) in email_row_ids for rid in row_ids):
                    matching_job_ids_from_emails.add(jr_id)

        conditions = []
        if matching_user_ids:
            conditions.append(JobResult.user_id.in_(matching_user_ids))
        if matching_job_ids_from_emails:
            conditions.append(JobResult.id.in_(matching_job_ids_from_emails))
        if conditions:
            q = q.filter(or_(*conditions))
        else:
            # No matches — return empty
            q = q.filter(JobResult.id == None)  # noqa: E711

    total = q.count()
    q = q.order_by(JobResult.created_at.desc())
    results = q.offset((page - 1) * per_page).limit(per_page).all()

    jobs = []
    for jr, user_email in results:
        jobs.append({
            "job_id": jr.id,
            "name": f"Send batch ({jr.total} rows)",
            "status": jr.status,
            "total": jr.total,
            "sent": jr.sent,
            "failed": jr.failed,
            "user_id": jr.user_id,
            "user_email": user_email or jr.user_id,
            "created_at": (jr.created_at.isoformat() + "Z") if jr.created_at else None,
            "scheduled_at": (jr.scheduled_at.isoformat() + "Z") if jr.scheduled_at else None,
            "completed_at": (jr.completed_at.isoformat() + "Z") if jr.completed_at else None,
        })

    return {"jobs": jobs, "total": total, "page": page, "per_page": per_page}


@router.delete("/jobs/{job_id}")
def admin_cancel_job(
    job_id: str,
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """Cancel any job (admin-level). No ownership check."""
    jr = db.query(JobResult).get(job_id)
    if not jr:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("queued", "scheduled", "error", "stale"):
        raise HTTPException(400, f"Cannot cancel job in '{jr.status}' status")

    # Clear scheduled_at on pending rows (same as user-level cancel)
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
    if not jr.completed_at:
        jr.completed_at = datetime.now(tz=timezone.utc)
    db.commit()

    admin_uid = get_user_id(auth)
    logger.info(f"Admin {admin_uid} cancelled job {job_id} (owner: {jr.user_id})")
    return {"job_id": jr.id, "status": "cancelled"}


@router.post("/jobs/{job_id}/force-error")
def admin_force_error_job(
    job_id: str,
    auth: dict = Depends(require_master_admin),
    db: Session = Depends(get_db),
):
    """Force a stuck running/queued job into error status. Master admin only."""
    jr = db.query(JobResult).get(job_id)
    if not jr:
        raise HTTPException(404, "Job not found")
    if jr.status not in ("running", "queued"):
        raise HTTPException(
            400,
            f"Job is '{jr.status}' — only running/queued jobs can be force-errored",
        )

    jr.status = "error"
    jr.errors = (jr.errors or []) + [
        f"Force-errored by admin at {datetime.now(tz=timezone.utc).isoformat()}Z"
    ]
    jr.completed_at = datetime.now(tz=timezone.utc)
    db.commit()

    admin_uid = get_user_id(auth)
    logger.info(f"Admin {admin_uid} force-errored job {job_id} (owner: {jr.user_id})")
    return {"job_id": jr.id, "status": "error"}
