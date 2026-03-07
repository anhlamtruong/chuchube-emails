from app.database import Base
from app.models.contact_base import ContactColumns


class Recruiter(ContactColumns, Base):
    __tablename__ = "recruiters"
