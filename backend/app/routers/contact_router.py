"""Generic CRUD router factory for contact-like entities (Recruiter / Referral)."""

from typing import Type

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_user_id, get_user_role, is_admin_role, require_auth
from app.database import get_db
from app.rate_limit import limiter
from app.schemas.contact_base import ContactCreate, ContactOut, ContactUpdate


def build_contact_router(
    *,
    prefix: str,
    tag: str,
    model_cls: Type,
    entity_label: str,
    schema_create: Type = ContactCreate,
    schema_update: Type = ContactUpdate,
    schema_out: Type = ContactOut,
) -> APIRouter:
    """Return a fully-wired APIRouter for a contact-like entity.

    Parameters
    ----------
    prefix : str          e.g. "/api/recruiters"
    tag : str             OpenAPI tag
    model_cls : Type      SQLAlchemy model class (Recruiter / Referral)
    entity_label : str    Human-readable label for error messages, e.g. "Recruiter"
    schema_create/update/out : optional overrides (default: shared Contact* schemas)
    """

    router = APIRouter(prefix=prefix, tags=[tag])

    # ── list ──────────────────────────────────────────────────────────
    @router.get("/")
    def list_items(
        search: str | None = Query(None),
        company: str | None = Query(None),
        location: str | None = Query(None),
        title: str | None = Query(None),
        approval_status: str | None = Query(None),
        page: int = Query(1, ge=1),
        per_page: int = Query(100, ge=1, le=500),
        auth: dict = Depends(require_auth),
        db: Session = Depends(get_db),
    ):
        uid = get_user_id(auth)
        q = db.query(model_cls)

        if is_admin_role(get_user_role(uid, db)):
            if approval_status:
                q = q.filter(model_cls.approval_status == approval_status)
        else:
            q = q.filter(model_cls.approval_status == "approved")

        if search:
            term = f"%{search}%"
            q = q.filter(
                or_(
                    model_cls.name.ilike(term),
                    model_cls.email.ilike(term),
                    model_cls.company.ilike(term),
                    model_cls.title.ilike(term),
                    model_cls.location.ilike(term),
                    model_cls.notes.ilike(term),
                )
            )
        if company:
            q = q.filter(model_cls.company.ilike(f"%{company}%"))
        if location:
            q = q.filter(model_cls.location.ilike(f"%{location}%"))
        if title:
            q = q.filter(model_cls.title.ilike(f"%{title}%"))

        q = q.order_by(model_cls.updated_at.desc())
        total = q.count()
        items = q.offset((page - 1) * per_page).limit(per_page).all()
        return {
            "items": [schema_out.model_validate(r, from_attributes=True) for r in items],
            "total": total,
        }

    # ── count ─────────────────────────────────────────────────────────
    @router.get("/count")
    def count_items(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
        uid = get_user_id(auth)
        if is_admin_role(get_user_role(uid, db)):
            return {"count": db.query(model_cls).count()}
        return {"count": db.query(model_cls).filter(model_cls.approval_status == "approved").count()}

    # ── get one ───────────────────────────────────────────────────────
    @router.get("/{item_id}", response_model=schema_out)
    def get_item(item_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
        uid = get_user_id(auth)
        r = db.query(model_cls).get(item_id)
        if not r:
            raise HTTPException(404, f"{entity_label} not found")
        if not is_admin_role(get_user_role(uid, db)) and r.approval_status != "approved":
            raise HTTPException(404, f"{entity_label} not found")
        return r

    # ── create ────────────────────────────────────────────────────────
    @router.post("/", response_model=schema_out, status_code=201)
    @limiter.limit("30/minute")
    def create_item(
        data: schema_create,  # type: ignore[valid-type]
        request: Request,
        auth: dict = Depends(require_auth),
        db: Session = Depends(get_db),
    ):
        uid = get_user_id(auth)
        existing = db.query(model_cls).filter(model_cls.email == data.email).first()
        if existing:
            raise HTTPException(409, f"{entity_label} with email {data.email} already exists")
        status = "approved" if is_admin_role(get_user_role(uid, db)) else "pending"
        r = model_cls(**data.model_dump(), user_id=uid, approval_status=status)
        db.add(r)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, f"{entity_label} with email {data.email} already exists")
        db.refresh(r)
        return r

    # ── update ────────────────────────────────────────────────────────
    @router.put("/{item_id}", response_model=schema_out)
    def update_item(
        item_id: str,
        data: schema_update,  # type: ignore[valid-type]
        auth: dict = Depends(require_auth),
        db: Session = Depends(get_db),
    ):
        uid = get_user_id(auth)
        if not is_admin_role(get_user_role(uid, db)):
            raise HTTPException(403, f"Only admin can edit {entity_label.lower()}s")
        r = db.query(model_cls).get(item_id)
        if not r:
            raise HTTPException(404, f"{entity_label} not found")
        update_data = data.model_dump(exclude_unset=True)
        new_email = update_data.get("email")
        if new_email and new_email != r.email:
            clash = db.query(model_cls).filter(model_cls.email == new_email).first()
            if clash:
                raise HTTPException(409, f"{entity_label} with email {new_email} already exists")
        for key, val in update_data.items():
            setattr(r, key, val)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, f"Email {new_email} is already taken")
        db.refresh(r)
        return r

    # ── delete ────────────────────────────────────────────────────────
    @router.delete("/{item_id}")
    def delete_item(item_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
        uid = get_user_id(auth)
        if not is_admin_role(get_user_role(uid, db)):
            raise HTTPException(403, f"Only admin can delete {entity_label.lower()}s")
        r = db.query(model_cls).get(item_id)
        if not r:
            raise HTTPException(404, f"{entity_label} not found")
        db.delete(r)
        db.commit()
        return {"ok": True}

    # ── bulk ──────────────────────────────────────────────────────────
    @router.post("/bulk", status_code=201)
    @limiter.limit("10/minute")
    def bulk_create(
        data: list[schema_create],  # type: ignore[valid-type]
        request: Request,
        auth: dict = Depends(require_auth),
        db: Session = Depends(get_db),
    ):
        uid = get_user_id(auth)
        status = "approved" if is_admin_role(get_user_role(uid, db)) else "pending"

        incoming_emails = list({(item.email or "").lower() for item in data if item.email})
        existing_emails: set[str] = set()
        if incoming_emails:
            for i in range(0, len(incoming_emails), 500):
                chunk = incoming_emails[i : i + 500]
                rows = db.query(model_cls.email).filter(model_cls.email.in_(chunk)).all()
                existing_emails.update(e.lower() for (e,) in rows)

        created = 0
        skipped = 0
        seen_emails: set[str] = set()
        for item in data:
            email_lower = (item.email or "").lower()
            if email_lower in seen_emails or email_lower in existing_emails:
                skipped += 1
                continue
            db.add(model_cls(**item.model_dump(), user_id=uid, approval_status=status))
            seen_emails.add(email_lower)
            created += 1
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "One or more emails already exist in the database")
        return {"created": created, "skipped": skipped}

    return router
