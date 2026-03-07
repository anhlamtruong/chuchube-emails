"""Recruiter schemas — thin aliases over shared ContactBase."""
from app.schemas.contact_base import (
    ContactBase as RecruiterBase,
    ContactCreate as RecruiterCreate,
    ContactUpdate as RecruiterUpdate,
    ContactOut as RecruiterOut,
    ContactSearch as RecruiterSearch,
)

__all__ = [
    "RecruiterBase",
    "RecruiterCreate",
    "RecruiterUpdate",
    "RecruiterOut",
    "RecruiterSearch",
]
