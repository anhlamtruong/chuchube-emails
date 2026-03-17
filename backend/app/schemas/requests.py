"""Request schemas extracted from routers (emails, campaigns, main).

Centralising Pydantic models in schemas/ keeps routers thin and makes
them reusable across tests and other modules.
"""
from datetime import datetime
from pydantic import BaseModel


# ── From emails.py ───────────────────────────────────────────────────── #

class RescheduleJobRequest(BaseModel):
    run_at: datetime
    timezone: str = "UTC"


# ── From campaigns.py ────────────────────────────────────────────────── #

class BulkDeleteRequest(BaseModel):
    ids: list[str]


class GenerateFromRecruitersRequest(BaseModel):
    recruiter_ids: list[str]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


class GenerateFromReferralsRequest(BaseModel):
    referral_ids: list[str]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


class BulkPasteRow(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    notes: str = ""


class BulkPasteRequest(BaseModel):
    rows: list[BulkPasteRow]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


# ── From main.py ─────────────────────────────────────────────────────── #

class AccessKeyValidateBody(BaseModel):
    key: str
