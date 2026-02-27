"""Pydantic schemas for custom column definitions."""
from datetime import datetime
from pydantic import BaseModel


class CustomColumnCreate(BaseModel):
    name: str
    default_value: str = ""
    sort_order: int = 0


class CustomColumnUpdate(BaseModel):
    name: str | None = None
    default_value: str | None = None
    sort_order: int | None = None


class CustomColumnOut(BaseModel):
    id: str
    user_id: str
    name: str
    default_value: str
    sort_order: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
