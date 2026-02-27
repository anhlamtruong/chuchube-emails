"""Pydantic schemas for SenderAccount CRUD."""
from pydantic import BaseModel, EmailStr
from datetime import datetime


class SenderAccountCreate(BaseModel):
    email: EmailStr
    display_name: str = ""
    provider: str  # "smtp" | "resend"
    smtp_host: str | None = None
    smtp_port: int | None = None
    credential: str  # password (SMTP) or API key (Resend) — never stored in DB
    is_default: bool = False
    organization_name: str | None = None
    organization_type: str | None = None  # "school" | "company"
    title: str | None = None
    city: str | None = None


class SenderAccountUpdate(BaseModel):
    email: EmailStr | None = None
    display_name: str | None = None
    provider: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    credential: str | None = None  # if provided, updates the vault secret
    is_default: bool | None = None
    organization_name: str | None = None
    organization_type: str | None = None
    title: str | None = None
    city: str | None = None


class SenderAccountOut(BaseModel):
    id: str
    email: str
    display_name: str
    provider: str
    smtp_host: str | None
    smtp_port: int | None
    is_default: bool
    organization_name: str | None = None
    organization_type: str | None = None
    title: str | None = None
    city: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
