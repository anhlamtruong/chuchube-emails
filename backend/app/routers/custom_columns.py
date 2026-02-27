"""CRUD router for custom column definitions."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.custom_column import CustomColumnDefinition
from app.schemas.custom_column import CustomColumnCreate, CustomColumnUpdate, CustomColumnOut

router = APIRouter(prefix="/api/custom-columns", tags=["custom-columns"])


@router.get("/", response_model=list[CustomColumnOut])
def list_custom_columns(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Return all custom column definitions for the current user, ordered by sort_order."""
    uid = get_user_id(auth)
    cols = (
        db.query(CustomColumnDefinition)
        .filter(CustomColumnDefinition.user_id == uid)
        .order_by(CustomColumnDefinition.sort_order, CustomColumnDefinition.created_at)
        .all()
    )
    return [CustomColumnOut.model_validate(c, from_attributes=True) for c in cols]


@router.post("/", response_model=CustomColumnOut, status_code=201)
def create_custom_column(data: CustomColumnCreate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Create a new custom column definition."""
    uid = get_user_id(auth)
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Column name is required")

    # Check duplicate
    existing = (
        db.query(CustomColumnDefinition)
        .filter(CustomColumnDefinition.user_id == uid, CustomColumnDefinition.name == name)
        .first()
    )
    if existing:
        raise HTTPException(409, f"Column '{name}' already exists")

    # Auto sort_order: put at the end
    max_sort = (
        db.query(CustomColumnDefinition.sort_order)
        .filter(CustomColumnDefinition.user_id == uid)
        .order_by(CustomColumnDefinition.sort_order.desc())
        .first()
    )
    sort_order = data.sort_order if data.sort_order else (max_sort[0] + 1 if max_sort else 0)

    col = CustomColumnDefinition(
        user_id=uid,
        name=name,
        default_value=data.default_value,
        sort_order=sort_order,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return CustomColumnOut.model_validate(col, from_attributes=True)


@router.put("/{col_id}", response_model=CustomColumnOut)
def update_custom_column(col_id: str, data: CustomColumnUpdate, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Update a custom column definition (name, default_value, sort_order)."""
    uid = get_user_id(auth)
    col = db.query(CustomColumnDefinition).get(col_id)
    if not col:
        raise HTTPException(404, "Custom column not found")
    if col.user_id != uid:
        raise HTTPException(403, "Not your custom column")

    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise HTTPException(400, "Column name cannot be empty")
        # Check duplicate for rename
        dup = (
            db.query(CustomColumnDefinition)
            .filter(
                CustomColumnDefinition.user_id == uid,
                CustomColumnDefinition.name == new_name,
                CustomColumnDefinition.id != col_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(409, f"Column '{new_name}' already exists")
        col.name = new_name

    if data.default_value is not None:
        col.default_value = data.default_value
    if data.sort_order is not None:
        col.sort_order = data.sort_order

    db.commit()
    db.refresh(col)
    return CustomColumnOut.model_validate(col, from_attributes=True)


@router.delete("/{col_id}")
def delete_custom_column(col_id: str, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Delete a custom column definition."""
    uid = get_user_id(auth)
    col = db.query(CustomColumnDefinition).get(col_id)
    if not col:
        raise HTTPException(404, "Custom column not found")
    if col.user_id != uid:
        raise HTTPException(403, "Not your custom column")

    db.delete(col)
    db.commit()
    return {"ok": True}


@router.put("/reorder/bulk")
def reorder_custom_columns(order: list[str], auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Reorder custom columns. `order` is a list of column IDs in the desired order."""
    uid = get_user_id(auth)
    for idx, col_id in enumerate(order):
        col = db.query(CustomColumnDefinition).get(col_id)
        if col and col.user_id == uid:
            col.sort_order = idx
    db.commit()
    return {"ok": True}
