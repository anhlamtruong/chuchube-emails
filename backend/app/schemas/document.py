from datetime import datetime
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    scope: str
    scope_ref: str | None = None
    user_id: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
