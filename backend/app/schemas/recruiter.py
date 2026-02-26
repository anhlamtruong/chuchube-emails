from datetime import datetime
from pydantic import BaseModel, EmailStr


class RecruiterBase(BaseModel):
    name: str
    email: str
    company: str = ""
    title: str = ""
    location: str = ""
    notes: str = ""


class RecruiterCreate(RecruiterBase):
    pass


class RecruiterUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    title: str | None = None
    location: str | None = None
    notes: str | None = None


class RecruiterOut(RecruiterBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class RecruiterSearch(BaseModel):
    search: str | None = None
    company: str | None = None
    location: str | None = None
    title: str | None = None
    page: int = 1
    per_page: int = 50
