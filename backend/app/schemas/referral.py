"""Referral schemas — thin aliases over shared ContactBase."""
from app.schemas.contact_base import (
    ContactBase as ReferralBase,
    ContactCreate as ReferralCreate,
    ContactUpdate as ReferralUpdate,
    ContactOut as ReferralOut,
    ContactSearch as ReferralSearch,
)

__all__ = [
    "ReferralBase",
    "ReferralCreate",
    "ReferralUpdate",
    "ReferralOut",
    "ReferralSearch",
]
