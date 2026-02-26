from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models.referral import Referral
from app.schemas.referral import (
    ReferralCreate,
    ReferralUpdate,
    ReferralOut,
)

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


@router.get("/")
def list_referrals(
    search: str | None = Query(None),
    company: str | None = Query(None),
    location: str | None = Query(None),
    title: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(Referral)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Referral.name.ilike(term),
                Referral.email.ilike(term),
                Referral.company.ilike(term),
                Referral.title.ilike(term),
                Referral.location.ilike(term),
                Referral.notes.ilike(term),
            )
        )
    if company:
        q = q.filter(Referral.company.ilike(f"%{company}%"))
    if location:
        q = q.filter(Referral.location.ilike(f"%{location}%"))
    if title:
        q = q.filter(Referral.title.ilike(f"%{title}%"))

    q = q.order_by(Referral.updated_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [ReferralOut.model_validate(r, from_attributes=True) for r in items], "total": total}


@router.get("/count")
def count_referrals(db: Session = Depends(get_db)):
    return {"count": db.query(Referral).count()}


@router.get("/{referral_id}", response_model=ReferralOut)
def get_referral(referral_id: str, db: Session = Depends(get_db)):
    r = db.query(Referral).get(referral_id)
    if not r:
        raise HTTPException(404, "Referral not found")
    return r


@router.post("/", response_model=ReferralOut, status_code=201)
def create_referral(data: ReferralCreate, db: Session = Depends(get_db)):
    existing = db.query(Referral).filter(Referral.email == data.email).first()
    if existing:
        raise HTTPException(409, f"Referral with email {data.email} already exists")
    r = Referral(**data.model_dump())
    db.add(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Referral with email {data.email} already exists")
    db.refresh(r)
    return r


@router.put("/{referral_id}", response_model=ReferralOut)
def update_referral(referral_id: str, data: ReferralUpdate, db: Session = Depends(get_db)):
    r = db.query(Referral).get(referral_id)
    if not r:
        raise HTTPException(404, "Referral not found")
    update_data = data.model_dump(exclude_unset=True)
    new_email = update_data.get("email")
    if new_email and new_email != r.email:
        clash = db.query(Referral).filter(Referral.email == new_email).first()
        if clash:
            raise HTTPException(409, f"Referral with email {new_email} already exists")
    for key, val in update_data.items():
        setattr(r, key, val)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Email {new_email} is already taken")
    db.refresh(r)
    return r


@router.delete("/{referral_id}")
def delete_referral(referral_id: str, db: Session = Depends(get_db)):
    r = db.query(Referral).get(referral_id)
    if not r:
        raise HTTPException(404, "Referral not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/bulk", status_code=201)
def bulk_create_referrals(data: list[ReferralCreate], db: Session = Depends(get_db)):
    created = 0
    skipped = 0
    seen_emails: set[str] = set()
    for item in data:
        email_lower = (item.email or "").lower()
        if email_lower in seen_emails:
            skipped += 1
            continue
        existing = db.query(Referral).filter(Referral.email == item.email).first()
        if existing:
            skipped += 1
            continue
        db.add(Referral(**item.model_dump()))
        seen_emails.add(email_lower)
        created += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "One or more emails already exist in the database")
    return {"created": created, "skipped": skipped}
