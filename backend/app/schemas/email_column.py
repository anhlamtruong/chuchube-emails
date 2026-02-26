from datetime import datetime, timezone as tz
from pydantic import BaseModel, model_serializer


def _utc_iso(dt: datetime | None) -> str | None:
    """Serialize a naive-UTC datetime with a trailing Z."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


class EmailColumnBase(BaseModel):
    sender_email: str = ""
    recipient_name: str = ""
    recipient_email: str = ""
    company: str = ""
    position: str = ""
    template_file: str = ""
    framework: str = ""
    my_strength: str = ""
    audience_value: str = ""
    custom_fields: dict | None = None
    sent_status: str = "pending"
    scheduled_at: datetime | None = None
    recruiter_id: str | None = None
    referral_id: str | None = None


class EmailColumnCreate(EmailColumnBase):
    pass


class EmailColumnUpdate(BaseModel):
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
    row_ids: list[str]


class ScheduleEmailsRequest(BaseModel):
    row_ids: list[str]
    run_at: datetime  # Local datetime (interpreted in the given timezone)
    timezone: str = "UTC"  # IANA timezone, e.g. "America/New_York"


class RecurringScheduleRequest(BaseModel):
    row_ids: list[str]
    cron: dict  # e.g. {"hour": 9, "minute": 0, "day_of_week": "mon-fri"}
    timezone: str = "UTC"  # IANA timezone
