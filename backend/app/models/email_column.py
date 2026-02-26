import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmailColumn(Base):
    __tablename__ = "email_columns"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    recipient_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    recipient_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    company: Mapped[str] = mapped_column(String(200), nullable=False, default="", index=True)
    position: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    template_file: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    framework: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    my_strength: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audience_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    custom_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    sent_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    recruiter_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("recruiters.id", ondelete="SET NULL"), nullable=True
    )
    recruiter = relationship("Recruiter", backref="email_columns", lazy="joined")
    referral_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("referrals.id", ondelete="SET NULL"), nullable=True
    )
    referral = relationship("Referral", backref="email_columns", lazy="joined")
    user_id: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
