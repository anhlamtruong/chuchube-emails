"""Shared column definitions for Recruiter & Referral models."""
import uuid
from datetime import date, datetime
from sqlalchemy import Date, String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, declared_attr


class ContactColumns:
    """Mixin providing the common columns for contact-like tables."""

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(200), nullable=False, default="", index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    location: Mapped[str] = mapped_column(String(200), nullable=False, default="", index=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    email_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="valid", index=True
    )
    ooo_return_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    user_id: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    approval_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="approved", server_default="approved", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
