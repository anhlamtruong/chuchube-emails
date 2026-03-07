"""Pydantic schemas for AccessKey management."""
from datetime import datetime
from pydantic import BaseModel, EmailStr


class AccessKeyCreate(BaseModel):
    label: str = ""
    notify_email: EmailStr | None = None  # If set, sends the key to this email


class AccessKeyOut(BaseModel):
    """Returned when listing keys — never exposes the full key."""
    id: str
    key_prefix: str | None = None
    label: str
    created_at: datetime | None = None
    used_by_user_id: str | None = None
    used_at: datetime | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class AccessKeyCreated(BaseModel):
    """Returned ONCE on creation — includes the plaintext key."""
    id: str
    key: str
    key_prefix: str
    label: str
    created_at: datetime | None = None
    is_active: bool = True

    model_config = {"from_attributes": True}


class AccessKeyValidate(BaseModel):
    key: str
