"""Pydantic schemas for UserRole management."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class UserRoleCreate(BaseModel):
    user_id: str = Field(..., max_length=200)
    email: str | None = Field(None, max_length=500)
    role: Literal["admin", "user"] = "user"


class UserRoleUpdate(BaseModel):
    role: Literal["admin", "user"]


class UserRoleOut(BaseModel):
    id: str
    user_id: str
    email: str | None = None
    role: str
    assigned_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
