from app.database import Base
from app.models.contact_base import ContactColumns


class Referral(ContactColumns, Base):
    __tablename__ = "referrals"
