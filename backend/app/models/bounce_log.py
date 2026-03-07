"""BounceLog model — records every detected bounce / OOO event."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BounceLog(Base):
    __tablename__ = "bounce_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    recipient_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    bounce_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "hard" | "soft" | "ooo" | "unknown"
    classification: Mapped[str] = mapped_column(String(30), nullable=False, default="rule")  # "rule" | "ai"
    raw_subject: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_snippet: Mapped[str] = mapped_column(Text, nullable=False, default="")  # first ~500 chars of body
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. "554 5.4.14"
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # extra metadata
    action_taken: Mapped[str] = mapped_column(String(50), nullable=False, default="none")  # "marked_bounced" | "ooo_noted" | "none"
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
