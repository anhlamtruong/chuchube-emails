"""AccessKey model — single-use keys for application access gating.

Keys are stored as bcrypt hashes. A `key_prefix` (first 8 chars) is stored
in cleartext to enable efficient lookup.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AccessKey(Base):
    __tablename__ = "access_keys"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    used_by_user_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # Legacy column kept for migration compatibility — new rows leave it NULL
    key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
