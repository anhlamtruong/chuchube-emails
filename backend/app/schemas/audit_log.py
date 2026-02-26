"""Schema for audit log API responses."""
from datetime import datetime
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: str
    user_id: str
    event_type: str
    resource_type: str
    resource_id: str | None = None
    detail: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
