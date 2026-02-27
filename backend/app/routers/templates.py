from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.template import Template
from app.schemas.template import (
    TemplateCreate,
    TemplateUpdate,
    TemplateOut,
    TemplatePreviewRequest,
)
from app.services.template_handler import safe_substitute

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("/", response_model=list[TemplateOut])
def list_templates(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    return (
        db.query(Template)
        .filter(or_(Template.user_id == uid, Template.user_id.is_(None)))
        .order_by(Template.user_id.is_(None), Template.name)
        .all()
    )


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    t = db.query(Template).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.user_id is not None and t.user_id != uid:
        raise HTTPException(403, "Not your template")
    return t


@router.post("/", response_model=TemplateOut, status_code=201)
def create_template(data: TemplateCreate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    existing = (
        db.query(Template)
        .filter(Template.name == data.name, Template.user_id == uid)
        .first()
    )
    if existing:
        raise HTTPException(409, f"Template '{data.name}' already exists")
    # If setting as default, clear existing default for this user
    if data.is_default:
        db.query(Template).filter(
            Template.user_id == uid, Template.is_default == True  # noqa: E712
        ).update({"is_default": False})
    t = Template(**data.model_dump(), user_id=uid)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(template_id: str, data: TemplateUpdate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    t = db.query(Template).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.user_id is None:
        raise HTTPException(403, "Cannot edit system templates")
    if t.user_id != uid:
        raise HTTPException(403, "Not your template")
    update_data = data.model_dump(exclude_unset=True)
    # If setting as default, clear existing default for this user
    if update_data.get("is_default") is True:
        db.query(Template).filter(
            Template.user_id == uid,
            Template.is_default == True,  # noqa: E712
            Template.id != template_id,
        ).update({"is_default": False})
    for key, val in update_data.items():
        setattr(t, key, val)
    db.commit()
    db.refresh(t)
    return t


@router.put("/{template_id}/set-default", response_model=TemplateOut)
def set_template_default(template_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Toggle a template as the user's default. Clears any other default."""
    uid = get_user_id(auth)
    t = db.query(Template).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.user_id is not None and t.user_id != uid:
        raise HTTPException(403, "Not your template")

    # If it's already default, unset it
    if t.is_default:
        t.is_default = False
    else:
        # Clear any existing default for this user (including system templates marked as default by this user)
        db.query(Template).filter(
            or_(Template.user_id == uid, Template.user_id.is_(None)),
            Template.is_default == True,  # noqa: E712
        ).update({"is_default": False}, synchronize_session="fetch")
        t.is_default = True

    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}")
def delete_template(template_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    uid = get_user_id(auth)
    t = db.query(Template).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.user_id is None:
        raise HTTPException(403, "Cannot delete system templates")
    if t.user_id != uid:
        raise HTTPException(403, "Not your template")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/{template_id}/preview")
def preview_template(
    template_id: str,
    data: TemplatePreviewRequest,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Render template with sample data and return result HTML."""
    uid = get_user_id(auth)
    t = db.query(Template).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.user_id is not None and t.user_id != uid:
        raise HTTPException(403, "Not your template")

    replacements = {
        "name": data.your_name,
        "first_name": data.first_name,
        "company": data.company,
        "position": data.position,
        "value_prop_sentence": data.value_prop_sentence,
        "your_name": data.your_name,
        "your_phone_number": data.your_phone_number,
        "your_email": data.your_email,
        "your_city_and_state": data.your_city_and_state,
        "dynamic_image_tag": "",
    }

    subject = safe_substitute(t.subject_line, replacements)
    body = safe_substitute(t.body_html, replacements)

    return {"subject": subject, "body": body}
