"""Pydantic schemas for email thread tracking."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

ThreadStatus = Literal["sent", "awaiting_reply", "replied", "needs_followup", "closed"]


class ThreadMessageOut(BaseModel):
    id: str
    thread_id: str
    direction: str  # "outbound" | "inbound"
    message_id: str | None = None
    in_reply_to: str | None = None
    from_email: str
    to_email: str
    subject: str
    body_html: str | None = None
    body_text: str | None = None
    sent_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ThreadListItem(BaseModel):
    id: str
    user_id: str
    campaign_row_id: str | None = None
    subject: str
    status: str
    last_activity_at: datetime | None = None
    reply_count: int = 0
    first_sent_at: datetime | None = None
    followup_due_at: datetime | None = None
    created_at: datetime | None = None
    # Denormalized preview fields
    recipient_name: str = ""
    recipient_email: str = ""
    company: str = ""
    latest_message_preview: str = ""

    model_config = {"from_attributes": True}


class ThreadDetail(BaseModel):
    id: str
    user_id: str
    campaign_row_id: str | None = None
    subject: str
    status: str
    last_activity_at: datetime | None = None
    reply_count: int = 0
    first_sent_at: datetime | None = None
    followup_due_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[ThreadMessageOut] = []
    # Campaign row context
    recipient_name: str = ""
    recipient_email: str = ""
    company: str = ""

    model_config = {"from_attributes": True}


class ThreadStats(BaseModel):
    total: int = 0
    awaiting_reply: int = 0
    replied: int = 0
    needs_followup: int = 0
    sent: int = 0
    closed: int = 0
    overdue_followups: int = 0


class ThreadStatusUpdate(BaseModel):
    status: ThreadStatus


class ThreadSnooze(BaseModel):
    days: int = Field(7, ge=1, le=90, description="Number of days to snooze the follow-up")
