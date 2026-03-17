from datetime import datetime, timezone as tz
from pydantic import BaseModel, EmailStr, Field, model_serializer


def _utc_iso(dt: datetime | None) -> str | None:
    """Serialize a naive-UTC datetime with a trailing Z."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


class EmailColumnBase(BaseModel):
    sender_email: EmailStr | str = Field("", max_length=500)
    recipient_name: str = Field("", max_length=500)
    recipient_email: EmailStr | str = Field("", max_length=500)
    company: str = Field("", max_length=500)
    position: str = Field("", max_length=500)
    template_file: str = Field("", max_length=500)
    framework: str = Field("", max_length=500)
    my_strength: str = Field("", max_length=2000)
    audience_value: str = Field("", max_length=2000)
    custom_fields: dict | None = None
    sent_status: str = Field("pending", max_length=50)
    scheduled_at: datetime | None = None
    recruiter_id: str | None = None
    referral_id: str | None = None


class EmailColumnCreate(EmailColumnBase):
    pass


class EmailColumnUpdate(BaseModel):
    sender_email: EmailStr | str | None = None
    recipient_name: str | None = None
    recipient_email: EmailStr | str | None = None
    company: str | None = None
    position: str | None = None
    template_file: str | None = None
    framework: str | None = None
    my_strength: str | None = None
    audience_value: str | None = None
    custom_fields: dict | None = None
    sent_status: str | None = None
    scheduled_at: datetime | None = None
    recruiter_id: str | None = None
    referral_id: str | None = None


class EmailColumnBulkUpdate(BaseModel):
    id: str
    sender_email: str | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    company: str | None = None
    position: str | None = None
    template_file: str | None = None
    framework: str | None = None
    my_strength: str | None = None
    audience_value: str | None = None
    custom_fields: dict | None = None
    sent_status: str | None = None
    scheduled_at: datetime | None = None
    recruiter_id: str | None = None
    referral_id: str | None = None


class EmailColumnOut(EmailColumnBase):
    id: str
    sent_at: datetime | None = None
    scheduled_at: datetime | None = None
    thread_id: str | None = None
    message_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

    @model_serializer(mode="wrap")
    def _serialize(self, handler):
        d = handler(self)
        for key in ("sent_at", "scheduled_at", "created_at", "updated_at"):
            d[key] = _utc_iso(getattr(self, key))
        return d


class SendEmailsRequest(BaseModel):
    row_ids: list[str] = Field(..., max_length=500)  # max 500 rows per send


class ScheduleEmailsRequest(BaseModel):
    row_ids: list[str] = Field(..., max_length=500)
    run_at: datetime  # Local datetime (interpreted in the given timezone)
    timezone: str = Field("UTC", max_length=100)  # IANA timezone, e.g. "America/New_York"
