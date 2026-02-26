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
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(t, key, val)
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

    try:
        subject = t.subject_line.format_map(replacements)
        body = t.body_html.format_map(replacements)
    except KeyError as e:
        raise HTTPException(400, f"Missing placeholder in preview data: {e}")

    return {"subject": subject, "body": body}
