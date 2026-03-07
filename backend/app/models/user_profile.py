"""UserProfile model — local cache of Clerk user data for admin views.

Populated automatically when users create jobs. Allows admin to see
which user_id corresponds to which email without calling the Clerk API.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
