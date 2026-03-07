"""Pydantic schemas for bounce detection endpoints."""
from datetime import datetime
from pydantic import BaseModel


class BounceLogOut(BaseModel):
    id: str
    sender_email: str
    recipient_email: str
    bounce_type: str
    classification: str
    raw_subject: str
    raw_snippet: str
    error_code: str | None = None
    detail: dict | None = None
    action_taken: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class BounceStats(BaseModel):
    total_bounces: int = 0
    hard_bounces: int = 0
    soft_bounces: int = 0
    ooo_replies: int = 0
    last_check: datetime | None = None
    bounced_contacts: int = 0
    risky_contacts: int = 0
    ooo_contacts: int = 0
    total_contacts: int = 0
    valid_contacts: int = 0
    enabled: bool = True


class BounceScanResult(BaseModel):
    accounts: int = 0
    checked: int = 0
    bounces: int = 0
    ooo: int = 0
    errors: list[str] = []


class BounceScanProgress(BaseModel):
    """Real-time progress of a running (or completed) manual scan."""
    status: str = "idle"  # idle | running | done | error
    current_account: str = ""
    total_accounts: int = 0
    accounts_done: int = 0
    checked: int = 0
    bounces: int = 0
    ooo: int = 0
    errors: list[str] = []
    started_at: datetime | None = None
    finished_at: datetime | None = None
