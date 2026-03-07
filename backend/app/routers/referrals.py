from app.models.referral import Referral
from app.schemas.referral import ReferralCreate, ReferralUpdate, ReferralOut
from app.routers.contact_router import build_contact_router

router = build_contact_router(
    prefix="/api/referrals",
    tag="referrals",
    model_cls=Referral,
    entity_label="Referral",
    schema_create=ReferralCreate,
    schema_update=ReferralUpdate,
    schema_out=ReferralOut,
)
