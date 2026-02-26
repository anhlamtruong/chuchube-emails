"""Settings management router."""
import smtplib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.setting import Setting
from app.schemas.setting import SettingOut, SettingUpdate, SettingsBulkUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=list[SettingOut])
def list_settings(db: Session = Depends(get_db)):
    """Return all settings."""
    return db.query(Setting).order_by(Setting.key).all()


@router.get("/{key}", response_model=SettingOut)
def get_setting(key: str, db: Session = Depends(get_db)):
    """Get a single setting by key."""
    s = db.query(Setting).filter(Setting.key == key).first()
    if not s:
        raise HTTPException(404, f"Setting '{key}' not found")
    return s


@router.put("/{key}", response_model=SettingOut)
def update_setting(key: str, data: SettingUpdate, db: Session = Depends(get_db)):
    """Update a single setting."""
    s = db.query(Setting).filter(Setting.key == key).first()
    if not s:
        raise HTTPException(404, f"Setting '{key}' not found")
    s.value = data.value
    db.commit()
    db.refresh(s)
    return s


@router.put("/", response_model=list[SettingOut])
def bulk_update_settings(data: SettingsBulkUpdate, db: Session = Depends(get_db)):
    """Update multiple settings at once."""
    updated = []
    for key, value in data.settings.items():
        s = db.query(Setting).filter(Setting.key == key).first()
        if s:
            s.value = value
            updated.append(s)
    db.commit()
    for s in updated:
        db.refresh(s)
    return updated


@router.post("/test-smtp")
def test_smtp(db: Session = Depends(get_db)):
    """Test the SMTP connection using current settings."""
    smtp_server_setting = db.query(Setting).filter(Setting.key == "smtp_server").first()
    smtp_port_setting = db.query(Setting).filter(Setting.key == "smtp_port").first()

    server = smtp_server_setting.value if smtp_server_setting else "smtp.gmail.com"
    port = int(smtp_port_setting.value) if smtp_port_setting else 587

    try:
        with smtplib.SMTP(server, port, timeout=10) as s:
            s.ehlo()
            s.starttls()
            s.ehlo()
        return {"ok": True, "message": f"Connected to {server}:{port} successfully"}
    except Exception as e:
        raise HTTPException(400, f"SMTP connection failed: {e}")
