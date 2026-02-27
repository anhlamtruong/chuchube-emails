"""Pydantic schemas for AccessKey management."""
from datetime import datetime
from pydantic import BaseModel


class AccessKeyCreate(BaseModel):
    label: str = ""


class AccessKeyOut(BaseModel):
    id: str
    key: str
    label: str
    created_at: datetime | None = None
    used_by_user_id: str | None = None
    used_at: datetime | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class AccessKeyValidate(BaseModel):
    key: str
