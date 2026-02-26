"""Application settings — persisted key-value store."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# Default settings seeded on first run
DEFAULT_SETTINGS: dict[str, tuple[str, str]] = {
    # Campaign defaults
    "default_position": (
        "Software Engineer Intern Spring 2026",
        "Default position for new campaign rows",
    ),
    "default_framework": (
        "passion",
        "Default framework type (passion, known_for, mission)",
    ),
    "default_my_strength": (
        "applying complex algorithms and software design principles",
        "Default 'my strength' value for campaign generation",
    ),
    "default_audience_value": (
        "highly reliable, optimized technology that solves critical challenges",
        "Default 'audience value' for campaign generation",
    ),
    # Personal info
    "your_name": ("", "Your full name used in email templates"),
    "your_phone": ("", "Your phone number used in email templates"),
    "your_city_state": ("", "Your city and state used in email templates"),
    # SMTP
    "smtp_server": ("smtp.gmail.com", "SMTP server hostname"),
    "smtp_port": ("465", "SMTP server port"),
    "sleep_between_emails": ("2", "Seconds to wait between sending emails"),
}
