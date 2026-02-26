from datetime import datetime
from pydantic import BaseModel


class TemplateBase(BaseModel):
    name: str
    subject_line: str = ""
    body_html: str = ""


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject_line: str | None = None
    body_html: str | None = None


class TemplateOut(TemplateBase):
    id: str
    user_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class TemplatePreviewRequest(BaseModel):
    first_name: str = "John"
    company: str = "Acme Corp"
    position: str = "Software Engineer"
    value_prop_sentence: str = "I'm passionate about building great software."
    your_name: str = "Your Name"
    your_phone_number: str = "(555) 555-5555"
    your_email: str = "you@example.com"
    your_city_and_state: str = "City, ST"
