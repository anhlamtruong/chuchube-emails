"""Audit logging service — records security-relevant events.

Provides both sync (within an existing DB session) and standalone
(opens its own session for background threads) helpers.
"""
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.database import SessionLocal
from app.logging_config import get_logger

logger = get_logger("audit")


def log_audit(
    db: Session,
    *,
    user_id: str,
    event_type: str,
    resource_type: str,
    resource_id: str | None = None,
    detail: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Write an audit log entry within an existing DB session (caller commits)."""
    entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    # We intentionally do NOT commit here — the caller manages the transaction.
    logger.info(f"audit: {event_type} user={user_id} resource={resource_type}/{resource_id}")


def log_audit_bg(
    *,
    user_id: str,
    event_type: str,
    resource_type: str,
    resource_id: str | None = None,
    detail: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Write an audit log entry using a standalone DB session (background threads)."""
    db = SessionLocal()
    try:
        log_audit(
            db,
            user_id=user_id,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to write audit log ({event_type}): {e}")
    finally:
        db.close()
