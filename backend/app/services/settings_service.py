"""Settings helper — provides quick access to per-user setting values from the DB."""
from sqlalchemy.orm import Session
from app.models.setting import Setting, DEFAULT_SETTINGS
from app import config


def ensure_user_settings(db: Session, user_id: str) -> None:
    """Lazily seed default settings for a user if they have none yet."""
    count = db.query(Setting).filter(Setting.user_id == user_id).count()
    if count > 0:
        return  # already seeded

    env_overrides = {
        "your_name": config.YOUR_NAME,
        "your_phone": config.YOUR_PHONE_NUMBER,
        "your_city_state": config.YOUR_STATE_AND_CITY,
        "smtp_server": config.SMTP_SERVER,
        "smtp_port": str(config.SMTP_PORT),
    }
    for key, (default_value, description) in DEFAULT_SETTINGS.items():
        value = env_overrides.get(key, default_value) or default_value
        db.add(Setting(user_id=user_id, key=key, value=value, description=description))
    db.commit()


def get_setting_value(db: Session, user_id: str, key: str, fallback: str = "") -> str:
    """Get a single setting value for a user. Returns fallback if not found."""
    s = db.query(Setting).filter(Setting.user_id == user_id, Setting.key == key).first()
    return s.value if s else fallback


def get_campaign_defaults(db: Session, user_id: str) -> dict[str, str]:
    """Return all campaign default values for a user as a dict."""
    keys = ["default_position", "default_framework", "default_my_strength", "default_audience_value"]
    settings = db.query(Setting).filter(Setting.user_id == user_id, Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "position": lookup.get("default_position", "Software Engineer Intern Spring 2026"),
        "framework": lookup.get("default_framework", "passion"),
        "my_strength": lookup.get("default_my_strength", ""),
        "audience_value": lookup.get("default_audience_value", ""),
    }


def get_personal_info(db: Session, user_id: str) -> dict[str, str]:
    """Return personal info settings for a user."""
    keys = ["your_name", "your_phone", "your_city_state"]
    settings = db.query(Setting).filter(Setting.user_id == user_id, Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "your_name": lookup.get("your_name", ""),
        "your_phone": lookup.get("your_phone", ""),
        "your_city_state": lookup.get("your_city_state", ""),
    }


def get_smtp_settings(db: Session, user_id: str) -> dict[str, str]:
    """Return SMTP settings for a user."""
    keys = ["smtp_server", "smtp_port", "sleep_between_emails"]
    settings = db.query(Setting).filter(Setting.user_id == user_id, Setting.key.in_(keys)).all()
    lookup = {s.key: s.value for s in settings}
    return {
        "smtp_server": lookup.get("smtp_server", "smtp.gmail.com"),
        "smtp_port": lookup.get("smtp_port", "465"),
        "sleep_between_emails": lookup.get("sleep_between_emails", "2"),
    }
