from app.models.recruiter import Recruiter
from app.schemas.recruiter import RecruiterCreate, RecruiterUpdate, RecruiterOut
from app.routers.contact_router import build_contact_router

router = build_contact_router(
    prefix="/api/recruiters",
    tag="recruiters",
    model_cls=Recruiter,
    entity_label="Recruiter",
    schema_create=RecruiterCreate,
    schema_update=RecruiterUpdate,
    schema_out=RecruiterOut,
)
