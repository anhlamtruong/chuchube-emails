from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models.recruiter import Recruiter
from app.schemas.recruiter import (
    RecruiterCreate,
    RecruiterUpdate,
    RecruiterOut,
)

router = APIRouter(prefix="/api/recruiters", tags=["recruiters"])


@router.get("/")
def list_recruiters(
    search: str | None = Query(None),
    company: str | None = Query(None),
    location: str | None = Query(None),
    title: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(Recruiter)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Recruiter.name.ilike(term),
                Recruiter.email.ilike(term),
                Recruiter.company.ilike(term),
                Recruiter.title.ilike(term),
                Recruiter.location.ilike(term),
                Recruiter.notes.ilike(term),
            )
        )
    if company:
        q = q.filter(Recruiter.company.ilike(f"%{company}%"))
    if location:
        q = q.filter(Recruiter.location.ilike(f"%{location}%"))
    if title:
        q = q.filter(Recruiter.title.ilike(f"%{title}%"))

    q = q.order_by(Recruiter.updated_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [RecruiterOut.model_validate(r, from_attributes=True) for r in items], "total": total}


@router.get("/count")
def count_recruiters(db: Session = Depends(get_db)):
    return {"count": db.query(Recruiter).count()}


@router.get("/{recruiter_id}", response_model=RecruiterOut)
def get_recruiter(recruiter_id: str, db: Session = Depends(get_db)):
    r = db.query(Recruiter).get(recruiter_id)
    if not r:
        raise HTTPException(404, "Recruiter not found")
    return r


@router.post("/", response_model=RecruiterOut, status_code=201)
def create_recruiter(data: RecruiterCreate, db: Session = Depends(get_db)):
    existing = db.query(Recruiter).filter(Recruiter.email == data.email).first()
    if existing:
        raise HTTPException(409, f"Recruiter with email {data.email} already exists")
    r = Recruiter(**data.model_dump())
    db.add(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Recruiter with email {data.email} already exists")
    db.refresh(r)
    return r


@router.put("/{recruiter_id}", response_model=RecruiterOut)
def update_recruiter(recruiter_id: str, data: RecruiterUpdate, db: Session = Depends(get_db)):
    r = db.query(Recruiter).get(recruiter_id)
    if not r:
        raise HTTPException(404, "Recruiter not found")
    update_data = data.model_dump(exclude_unset=True)
    new_email = update_data.get("email")
    if new_email and new_email != r.email:
        clash = db.query(Recruiter).filter(Recruiter.email == new_email).first()
        if clash:
            raise HTTPException(409, f"Recruiter with email {new_email} already exists")
    for key, val in update_data.items():
        setattr(r, key, val)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Email {new_email} is already taken")
    db.refresh(r)
    return r


@router.delete("/{recruiter_id}")
def delete_recruiter(recruiter_id: str, db: Session = Depends(get_db)):
    r = db.query(Recruiter).get(recruiter_id)
    if not r:
        raise HTTPException(404, "Recruiter not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/bulk", status_code=201)
def bulk_create_recruiters(data: list[RecruiterCreate], db: Session = Depends(get_db)):
    created = 0
    skipped = 0
    seen_emails: set[str] = set()
    for item in data:
        email_lower = (item.email or "").lower()
        if email_lower in seen_emails:
            skipped += 1
            continue
        existing = db.query(Recruiter).filter(Recruiter.email == item.email).first()
        if existing:
            skipped += 1
            continue
        db.add(Recruiter(**item.model_dump()))
        seen_emails.add(email_lower)
        created += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "One or more emails already exist in the database")
    return {"created": created, "skipped": skipped}
