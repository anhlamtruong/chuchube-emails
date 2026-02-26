"""Consent router — per-user legal policy acceptance tracking."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.user_consent import (
    UserConsent,
    CURRENT_CONSENT_VERSIONS,
    REQUIRED_CONSENT_TYPES,
)
from app.logging_config import get_logger

logger = get_logger("consent")

router = APIRouter(prefix="/api/consent", tags=["consent"])


# --- Schemas ---

class AcceptConsentRequest(BaseModel):
    consent_type: str
    version: str


class ConsentItem(BaseModel):
    consent_type: str
    required_version: str
    accepted: bool
    accepted_at: str | None = None


# --- Endpoints ---

@router.get("/status")
def get_consent_status(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Return which consents the current user has accepted."""
    uid = get_user_id(auth)
    result: list[dict] = []

    for ctype, version in CURRENT_CONSENT_VERSIONS.items():
        record = (
            db.query(UserConsent)
            .filter(
                UserConsent.user_id == uid,
                UserConsent.consent_type == ctype,
                UserConsent.version == version,
            )
            .first()
        )
        result.append({
            "consent_type": ctype,
            "required_version": version,
            "accepted": record is not None,
            "accepted_at": record.accepted_at.isoformat() + "Z" if record else None,
        })

    all_accepted = all(c["accepted"] for c in result)
    return {"consents": result, "all_accepted": all_accepted}


@router.post("/accept")
def accept_consent(
    req: AcceptConsentRequest,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Record the user's acceptance of a specific policy version."""
    uid = get_user_id(auth)

    if req.consent_type not in REQUIRED_CONSENT_TYPES:
        raise HTTPException(400, f"Unknown consent type: {req.consent_type}")

    expected_version = CURRENT_CONSENT_VERSIONS[req.consent_type]
    if req.version != expected_version:
        raise HTTPException(
            400,
            f"Version mismatch: expected {expected_version}, got {req.version}",
        )

    # Check if already accepted
    existing = (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == uid,
            UserConsent.consent_type == req.consent_type,
            UserConsent.version == req.version,
        )
        .first()
    )
    if existing:
        return {"status": "already_accepted", "consent_type": req.consent_type}

    # Record consent
    ip = request.client.host if request.client else None
    consent = UserConsent(
        user_id=uid,
        consent_type=req.consent_type,
        version=req.version,
        ip_address=ip,
    )
    db.add(consent)
    db.commit()
    logger.info(f"User {uid} accepted {req.consent_type} v{req.version} from {ip}")
    return {"status": "accepted", "consent_type": req.consent_type}


@router.post("/accept-all")
def accept_all_consents(
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Accept all required consents at once."""
    uid = get_user_id(auth)
    ip = request.client.host if request.client else None
    accepted = []

    for ctype, version in CURRENT_CONSENT_VERSIONS.items():
        existing = (
            db.query(UserConsent)
            .filter(
                UserConsent.user_id == uid,
                UserConsent.consent_type == ctype,
                UserConsent.version == version,
            )
            .first()
        )
        if not existing:
            consent = UserConsent(
                user_id=uid,
                consent_type=ctype,
                version=version,
                ip_address=ip,
            )
            db.add(consent)
            accepted.append(ctype)

    db.commit()
    logger.info(f"User {uid} accepted all consents from {ip}: {accepted}")
    return {"status": "accepted", "accepted": accepted}


@router.get("/history")
def get_consent_history(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Full consent history for the current user (audit trail)."""
    uid = get_user_id(auth)
    records = (
        db.query(UserConsent)
        .filter(UserConsent.user_id == uid)
        .order_by(UserConsent.accepted_at.desc())
        .all()
    )
    return {
        "history": [
            {
                "consent_type": r.consent_type,
                "version": r.version,
                "accepted_at": r.accepted_at.isoformat() + "Z" if r.accepted_at else None,
                "ip_address": r.ip_address,
            }
            for r in records
        ]
    }


# --- Dependency for guarding send/schedule endpoints ---

def require_consent(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """FastAPI dependency — blocks access unless user has accepted all required consents."""
    uid = get_user_id(auth)

    for ctype, version in CURRENT_CONSENT_VERSIONS.items():
        record = (
            db.query(UserConsent)
            .filter(
                UserConsent.user_id == uid,
                UserConsent.consent_type == ctype,
                UserConsent.version == version,
            )
            .first()
        )
        if not record:
            raise HTTPException(
                403,
                detail={
                    "message": "You must accept all required policies before sending emails.",
                    "missing_consent": ctype,
                    "required_version": version,
                },
            )
    return auth
