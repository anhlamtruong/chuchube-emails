"""Settings management router (per-user)."""
import smtplib
import ssl
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.setting import Setting
from app.schemas.setting import SettingOut, SettingUpdate, SettingsBulkUpdate
from app.services.settings_service import ensure_user_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=list[SettingOut])
def list_settings(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Return all settings for the authenticated user."""
    uid = get_user_id(auth)
    ensure_user_settings(db, uid)
    return db.query(Setting).filter(Setting.user_id == uid).order_by(Setting.key).all()


@router.get("/{key}", response_model=SettingOut)
def get_setting(key: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Get a single setting by key for the authenticated user."""
    uid = get_user_id(auth)
    s = db.query(Setting).filter(Setting.user_id == uid, Setting.key == key).first()
    if not s:
        raise HTTPException(404, f"Setting '{key}' not found")
    return s


@router.put("/{key}", response_model=SettingOut)
def update_setting(key: str, data: SettingUpdate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Update a single setting for the authenticated user."""
    uid = get_user_id(auth)
    s = db.query(Setting).filter(Setting.user_id == uid, Setting.key == key).first()
    if not s:
        raise HTTPException(404, f"Setting '{key}' not found")
    s.value = data.value
    db.commit()
    db.refresh(s)
    return s


@router.put("/", response_model=list[SettingOut])
def bulk_update_settings(data: SettingsBulkUpdate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Update multiple settings at once for the authenticated user."""
    uid = get_user_id(auth)
    updated = []
    for key, value in data.settings.items():
        s = db.query(Setting).filter(Setting.user_id == uid, Setting.key == key).first()
        if s:
            s.value = value
            updated.append(s)
    db.commit()
    for s in updated:
        db.refresh(s)
    return updated


@router.post("/test-smtp")
def test_smtp(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Test the SMTP connection using current user's settings."""
    uid = get_user_id(auth)
    smtp_server_setting = db.query(Setting).filter(Setting.user_id == uid, Setting.key == "smtp_server").first()
    smtp_port_setting = db.query(Setting).filter(Setting.user_id == uid, Setting.key == "smtp_port").first()

    server = smtp_server_setting.value if smtp_server_setting else "smtp.gmail.com"
    port = int(smtp_port_setting.value) if smtp_port_setting else 465

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(server, port, context=context, timeout=10) as s:
            s.ehlo()
        return {"ok": True, "message": f"Connected to {server}:{port} (SSL) successfully"}
    except Exception as e:
        import logging
        logging.getLogger("app.settings").error(f"SMTP test failed for {server}:{port}: {e}")
        raise HTTPException(400, "SMTP connection failed. Check your server settings and try again.")
