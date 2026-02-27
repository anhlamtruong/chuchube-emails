"""Admin-only router — access key management and org account overview.

All endpoints gated to ADMIN_USER_ID only.
"""
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id
from app.config import ADMIN_USER_ID
from app.models.access_key import AccessKey
from app.models.sender_account import SenderAccount
from app.schemas.access_key import AccessKeyCreate, AccessKeyOut
from app.logging_config import get_logger

logger = get_logger("admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(auth: dict = Depends(require_auth)):
    """Dependency — only the admin user can access these endpoints."""
    uid = get_user_id(auth)
    if uid != ADMIN_USER_ID:
        raise HTTPException(403, "Admin access required")
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


@router.post("/access-keys", response_model=AccessKeyOut, status_code=201)
def generate_access_key(
    data: AccessKeyCreate,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Generate a new single-use access key."""
    key_value = secrets.token_hex(16)  # 32-char hex string
    ak = AccessKey(key=key_value, label=data.label)
    db.add(ak)
    db.commit()
    db.refresh(ak)
    logger.info(f"Admin generated access key {ak.id} label='{data.label}'")
    return ak


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
def check_admin(auth: dict = Depends(require_auth)):
    """Check if the current user is the admin. Returns {is_admin: bool}."""
    uid = get_user_id(auth)
    return {"is_admin": uid == ADMIN_USER_ID}
