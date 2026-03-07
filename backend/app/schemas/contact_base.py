"""Shared Pydantic schemas for Recruiter & Referral."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

EmailStatus = Literal["valid", "bounced", "risky", "ooo"]


class ContactBase(BaseModel):
    name: str = Field(..., max_length=500)
    email: EmailStr = Field(..., max_length=500)
    company: str = Field("", max_length=500)
    title: str = Field("", max_length=500)
    location: str = Field("", max_length=500)
    notes: str = Field("", max_length=5000)
    email_status: EmailStatus = Field("valid")


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    company: str | None = None
    title: str | None = None
    location: str | None = None
    notes: str | None = None
    email_status: EmailStatus | None = None


class ContactOut(ContactBase):
    id: str
    user_id: str | None = None
    approval_status: str = "approved"
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ContactSearch(BaseModel):
    search: str | None = None
    company: str | None = None
    location: str | None = None
    title: str | None = None
    page: int = 1
    per_page: int = 50
