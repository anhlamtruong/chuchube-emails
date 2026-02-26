"""UserConsent model — tracks per-user acceptance of legal policies."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


# Bump these when policies change to re-prompt users
CURRENT_CONSENT_VERSIONS = {
    "terms_of_service": "1.0",
    "privacy_policy": "1.0",
    "send_on_behalf": "1.0",
}

REQUIRED_CONSENT_TYPES = list(CURRENT_CONSENT_VERSIONS.keys())


class UserConsent(Base):
    __tablename__ = "user_consents"
    __table_args__ = (
        UniqueConstraint("user_id", "consent_type", "version", name="uq_user_consent"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    consent_type: Mapped[str] = mapped_column(String(50), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
