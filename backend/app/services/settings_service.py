"""Settings helper — provides quick access to setting values from the DB."""
from sqlalchemy.orm import Session
from app.models.setting import Setting


def get_setting_value(db: Session, key: str, fallback: str = "") -> str:
    """Get a single setting value. Returns fallback if not found."""
    s = db.query(Setting).filter(Setting.key == key).first()
    return s.value if s else fallback


def get_campaign_defaults(db: Session) -> dict[str, str]:
    """Return all campaign default values as a dict."""
    keys = ["default_position", "default_framework", "default_my_strength", "default_audience_value"]
    settings = db.query(Setting).filter(Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "position": lookup.get("default_position", "Software Engineer Intern Spring 2026"),
        "framework": lookup.get("default_framework", "passion"),
        "my_strength": lookup.get("default_my_strength", ""),
        "audience_value": lookup.get("default_audience_value", ""),
    }


def get_personal_info(db: Session) -> dict[str, str]:
    """Return personal info settings."""
    keys = ["your_name", "your_phone", "your_city_state"]
    settings = db.query(Setting).filter(Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "your_name": lookup.get("your_name", ""),
        "your_phone": lookup.get("your_phone", ""),
        "your_city_state": lookup.get("your_city_state", ""),
    }


def get_smtp_settings(db: Session) -> dict[str, str]:
    """Return SMTP settings."""
    keys = ["smtp_server", "smtp_port", "sleep_between_emails"]
    settings = db.query(Setting).filter(Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "smtp_server": lookup.get("smtp_server", "smtp.gmail.com"),
        "smtp_port": lookup.get("smtp_port", "465"),
        "sleep_between_emails": lookup.get("sleep_between_emails", "2"),
    }
