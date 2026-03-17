"""EmailThread and ThreadMessage models — email conversation tracking."""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, JSON, func, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmailThread(Base):
    __tablename__ = "email_threads"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    campaign_row_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_columns.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="sent", index=True)
    # status values: sent, awaiting_reply, replied, needs_followup, closed
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    reply_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    followup_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    campaign_row = relationship(
        "EmailColumn",
        foreign_keys=[campaign_row_id],
        backref="campaign_thread",
        lazy="select",
        uselist=False,
    )
    messages = relationship("ThreadMessage", back_populates="thread", order_by="ThreadMessage.sent_at", lazy="select")

    __table_args__ = (
        Index("ix_email_threads_user_status", "user_id", "status"),
        Index("ix_email_threads_user_followup", "user_id", "followup_due_at"),
    )


class ThreadMessage(Base):
    __tablename__ = "thread_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    thread_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # "outbound" or "inbound"
    message_id: Mapped[str | None] = mapped_column(String(500), nullable=True, unique=True, index=True)
    in_reply_to: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    references: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    thread = relationship("EmailThread", back_populates="messages")
