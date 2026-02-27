from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.email_column import EmailColumn
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.custom_column import CustomColumnDefinition
from app.services.settings_service import get_campaign_defaults, get_custom_column_defaults
from app.schemas.email_column import (
    EmailColumnCreate,
    EmailColumnUpdate,
    EmailColumnBulkUpdate,
    EmailColumnOut,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.get("/custom-columns")
def get_custom_columns(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the distinct set of custom field keys — from definitions + any extra keys in existing rows."""
    uid = get_user_id(auth)
    # Get defined columns
    definitions = (
        db.query(CustomColumnDefinition.name)
        .filter(CustomColumnDefinition.user_id == uid)
        .order_by(CustomColumnDefinition.sort_order)
        .all()
    )
    keys: list[str] = [d.name for d in definitions]
    defined_set = set(keys)

    # Also scan existing rows for any undeclared keys
    from sqlalchemy import or_  # noqa: E811
    rows = db.query(EmailColumn.custom_fields).filter(
        or_(EmailColumn.user_id == uid, EmailColumn.user_id.is_(None)),
        EmailColumn.custom_fields.isnot(None),
    ).all()
    for (cf,) in rows:
        if isinstance(cf, dict):
            for k in cf.keys():
                if k not in defined_set:
                    keys.append(k)
                    defined_set.add(k)
    return {"columns": keys}


@router.get("/")
def list_campaigns(
    search: str | None = Query(None),
    sent_status: str | None = Query(None),
    company: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    uid = get_user_id(auth)
    # Claim any orphaned rows (pre-migration data with user_id=NULL)
    from sqlalchemy import or_  # noqa: E811
    orphans = db.query(EmailColumn).filter(EmailColumn.user_id.is_(None)).count()
    if orphans:
        db.query(EmailColumn).filter(EmailColumn.user_id.is_(None)).update(
            {EmailColumn.user_id: uid}, synchronize_session=False
        )
        db.commit()
    q = db.query(EmailColumn).filter(EmailColumn.user_id == uid)
    if search:
        term = f"%{search}%"

        q = q.filter(
            or_(
                EmailColumn.recipient_name.ilike(term),
                EmailColumn.recipient_email.ilike(term),
                EmailColumn.company.ilike(term),
                EmailColumn.position.ilike(term),
            )
        )
    if sent_status:
        q = q.filter(EmailColumn.sent_status == sent_status)
    if company:
        q = q.filter(EmailColumn.company.ilike(f"%{company}%"))
    q = q.order_by(EmailColumn.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [EmailColumnOut.model_validate(r, from_attributes=True) for r in items], "total": total}


@router.get("/count")
def count_campaigns(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    from sqlalchemy import func  # noqa: E811
    total = db.query(EmailColumn).filter(EmailColumn.user_id == uid).count()

    statuses = (
        db.query(EmailColumn.sent_status, func.count())
        .filter(EmailColumn.user_id == uid)
        .group_by(EmailColumn.sent_status)
        .all()
    )
    return {"total": total, "by_status": {s: c for s, c in statuses}}


@router.get("/{row_id}", response_model=EmailColumnOut)
def get_campaign(row_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    r = db.query(EmailColumn).get(row_id)
    if not r:
        raise HTTPException(404, "Campaign row not found")
    if r.user_id != uid:
        raise HTTPException(403, "Not your campaign row")
    return r


@router.post("/", response_model=EmailColumnOut, status_code=201)
def create_campaign(data: EmailColumnCreate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    r = EmailColumn(**data.model_dump(), user_id=uid)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/{row_id}", response_model=EmailColumnOut)
def update_campaign(row_id: str, data: EmailColumnUpdate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    r = db.query(EmailColumn).get(row_id)
    if not r:
        raise HTTPException(404, "Campaign row not found")
    if r.user_id != uid:
        raise HTTPException(403, "Not your campaign row")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(r, key, val)
    db.commit()
    db.refresh(r)
    return r


@router.put("/bulk/update")
def bulk_update_campaigns(rows: list[EmailColumnBulkUpdate], auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    updated = 0
    for item in rows:
        r = db.query(EmailColumn).get(item.id)
        if not r or r.user_id != uid:
            continue
        for key, val in item.model_dump(exclude_unset=True, exclude={"id"}).items():
            setattr(r, key, val)
        updated += 1
    db.commit()
    return {"updated": updated}


@router.delete("/{row_id}")
def delete_campaign(row_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    r = db.query(EmailColumn).get(row_id)
    if not r:
        raise HTTPException(404, "Campaign row not found")
    if r.user_id != uid:
        raise HTTPException(403, "Not your campaign row")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.delete("/bulk/delete")
def bulk_delete_campaigns(ids: list[str], auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    deleted = db.query(EmailColumn).filter(
        EmailColumn.id.in_(ids), EmailColumn.user_id == uid
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


# --- Generate campaigns from recruiter filters ---

class GenerateFromRecruitersRequest(BaseModel):
    recruiter_ids: list[str]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


@router.post("/generate-from-recruiters")
def generate_from_recruiters(req: GenerateFromRecruitersRequest, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Create campaign rows from selected recruiter IDs."""
    uid = get_user_id(auth)
    recruiters = db.query(Recruiter).filter(Recruiter.id.in_(req.recruiter_ids)).all()
    defaults = get_campaign_defaults(db, uid)
    position = req.position.strip() if req.position.strip() else defaults["position"]
    # Build custom_fields: definition defaults merged with overrides
    cf_defaults = get_custom_column_defaults(db, uid)
    custom_fields = {**cf_defaults, **{k: v for k, v in req.custom_field_overrides.items() if v.strip()}} if cf_defaults or req.custom_field_overrides else None
    created = 0
    for r in recruiters:
        ec = EmailColumn(
            sender_email=req.sender_email,
            recipient_name=r.name,
            recipient_email=r.email,
            company=r.company,
            position=position,
            template_file=req.template_file,
            recruiter_id=r.id,
            sent_status="pending",
            framework=defaults["framework"],
            my_strength=defaults["my_strength"],
            audience_value=defaults["audience_value"],
            custom_fields=custom_fields,
            user_id=uid,
        )
        db.add(ec)
        created += 1
    db.commit()
    return {"created": created}


# --- Generate campaigns from referral filters ---

class GenerateFromReferralsRequest(BaseModel):
    referral_ids: list[str]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


@router.post("/generate-from-referrals")
def generate_from_referrals(req: GenerateFromReferralsRequest, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Create campaign rows from selected referral IDs."""
    uid = get_user_id(auth)
    referrals = db.query(Referral).filter(Referral.id.in_(req.referral_ids)).all()
    defaults = get_campaign_defaults(db, uid)
    position = req.position.strip() if req.position.strip() else defaults["position"]
    # Build custom_fields: definition defaults merged with overrides
    cf_defaults = get_custom_column_defaults(db, uid)
    custom_fields = {**cf_defaults, **{k: v for k, v in req.custom_field_overrides.items() if v.strip()}} if cf_defaults or req.custom_field_overrides else None
    created = 0
    for r in referrals:
        ec = EmailColumn(
            sender_email=req.sender_email,
            recipient_name=r.name,
            recipient_email=r.email,
            company=r.company,
            position=position,
            template_file=req.template_file,
            referral_id=r.id,
            sent_status="pending",
            framework=defaults["framework"],
            my_strength=defaults["my_strength"],
            audience_value=defaults["audience_value"],
            custom_fields=custom_fields,
            user_id=uid,
        )
        db.add(ec)
        created += 1
    db.commit()
    return {"created": created}


# --- Bulk paste: CSV rows → Recruiter DB + Campaign rows ---

class BulkPasteRow(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    notes: str = ""


class BulkPasteRequest(BaseModel):
    rows: list[BulkPasteRow]
    sender_email: str = ""
    template_file: str = ""
    position: str = ""
    custom_field_overrides: dict[str, str] = {}


@router.post("/bulk-paste")
def bulk_paste_campaigns(req: BulkPasteRequest, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """
    Paste CSV rows → upsert into Recruiters + create Campaign rows.
    If a recruiter email already exists, link to the existing one.
    """
    uid = get_user_id(auth)
    recruiters_created = 0
    recruiters_existing = 0
    campaigns_created = 0
    defaults = get_campaign_defaults(db, uid)
    # Build custom_fields: definition defaults merged with overrides
    cf_defaults = get_custom_column_defaults(db, uid)
    custom_fields = {**cf_defaults, **{k: v for k, v in req.custom_field_overrides.items() if v.strip()}} if cf_defaults or req.custom_field_overrides else None

    for row in req.rows:
        email = row.email.strip()
        if not email:
            continue

        # Upsert recruiter
        existing = db.query(Recruiter).filter(Recruiter.email == email).first()
        if existing:
            recruiter = existing
            recruiters_existing += 1
        else:
            recruiter = Recruiter(
                name=row.name.strip(),
                email=email,
                company=row.company.strip(),
                title=row.title.strip(),
                location=row.location.strip(),
                notes=row.notes.strip(),
            )
            db.add(recruiter)
            db.flush()
            recruiters_created += 1

        # Create campaign row
        ec = EmailColumn(
            sender_email=req.sender_email,
            recipient_name=recruiter.name,
            recipient_email=recruiter.email,
            company=recruiter.company,
            position=req.position.strip() if req.position.strip() else defaults["position"],
            template_file=req.template_file,
            recruiter_id=recruiter.id,
            sent_status="pending",
            framework=defaults["framework"],
            my_strength=defaults["my_strength"],
            audience_value=defaults["audience_value"],
            custom_fields=custom_fields,
            user_id=uid,
        )
        db.add(ec)
        campaigns_created += 1

    db.commit()
    return {
        "recruiters_created": recruiters_created,
        "recruiters_existing": recruiters_existing,
        "campaigns_created": campaigns_created,
    }
