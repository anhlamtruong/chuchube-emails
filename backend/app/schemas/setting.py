"""Settings schemas."""
from pydantic import BaseModel


class SettingOut(BaseModel):
    key: str
    value: str
    description: str

    model_config = {"from_attributes": True}


class SettingUpdate(BaseModel):
    value: str


class SettingsBulkUpdate(BaseModel):
    """Update multiple settings at once: {key: value, ...}"""
    settings: dict[str, str]
