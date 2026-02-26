"""Router for reading audit logs (own events only)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("/", response_model=list[AuditLogOut])
def list_audit_logs(
    event_type: str | None = Query(None, description="Filter by event type"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Return paginated audit logs for the current user (own events only)."""
    uid = get_user_id(auth)
    q = db.query(AuditLog).filter(AuditLog.user_id == uid)

    if event_type:
        q = q.filter(AuditLog.event_type == event_type)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    logs = (
        q.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return logs
