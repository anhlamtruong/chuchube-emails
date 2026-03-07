"""Excel import/export service — migrated from sending_email/excel_handler.py"""
import io
import pandas as pd
from sqlalchemy.orm import Session
from app.models.email_column import EmailColumn
from app.models.recruiter import Recruiter


# Column name mapping: Excel column name → model field
EXCEL_TO_MODEL = {
    "Sender Email": "sender_email",
    "Name": "recipient_name",
    "Email": "recipient_email",
    "Companies": "company",
    "Positions": "position",
    "Template File": "template_file",
    "Framework": "framework",
    "my strength": "my_strength",
    "something my target audience values": "audience_value",
    "Sent or Not": "sent_status",
}

MODEL_TO_EXCEL = {v: k for k, v in EXCEL_TO_MODEL.items()}


def import_excel(file_bytes: bytes, db: Session, *, user_id: str | None = None) -> dict:
    """Import an Excel file into EmailColumn rows. Returns stats."""
    df = pd.read_excel(io.BytesIO(file_bytes), dtype={"Sent or Not": str})
    created = 0
    skipped = 0

    for _, row in df.iterrows():
        data = {}
        for excel_col, model_col in EXCEL_TO_MODEL.items():
            val = row.get(excel_col, "")
            if pd.isna(val):
                val = ""
            data[model_col] = str(val).strip()

        # Normalize sent_status
        status = data.get("sent_status", "").lower().strip()
        if status in ("sent", "response"):
            data["sent_status"] = status
        else:
            data["sent_status"] = "pending"

        if user_id:
            data["user_id"] = user_id

        email_col = EmailColumn(**data)
        db.add(email_col)
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}


def import_recruiters_from_excel(file_bytes: bytes, db: Session, *, user_id: str | None = None, is_admin: bool = False) -> dict:
    """Import recruiters from an Excel file. Deduplicates by email."""
    df = pd.read_excel(io.BytesIO(file_bytes))
    created = 0
    skipped = 0

    approval = "approved" if is_admin else "pending"

    # Batch-check existing emails
    all_emails = [str(row.get("Email", "")).strip().lower() for _, row in df.iterrows() if str(row.get("Email", "")).strip()]
    existing_emails: set[str] = set()
    for i in range(0, len(all_emails), 500):
        chunk = all_emails[i:i+500]
        results = db.query(Recruiter.email).filter(Recruiter.email.in_(chunk)).all()
        existing_emails.update(e.lower() for (e,) in results)

    for _, row in df.iterrows():
        email = str(row.get("Email", "")).strip()
        if not email:
            skipped += 1
            continue

        if email.lower() in existing_emails:
            skipped += 1
            continue

        recruiter = Recruiter(
            name=str(row.get("Name", "")).strip(),
            email=email,
            company=str(row.get("Companies", row.get("Company", ""))).strip(),
            title=str(row.get("Positions", row.get("Title", ""))).strip(),
            location=str(row.get("Location", "")).strip(),
            notes=str(row.get("Notes", "")).strip(),
            user_id=user_id,
            approval_status=approval,
        )
        db.add(recruiter)
        existing_emails.add(email.lower())
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}


def export_excel(db: Session, *, user_id: str | None = None) -> bytes:
    """Export EmailColumn rows to an Excel file (bytes). Scoped to user_id if provided."""
    q = db.query(EmailColumn)
    if user_id:
        q = q.filter(EmailColumn.user_id == user_id)
    rows = q.all()
    data = []
    for r in rows:
        row_dict = {}
        for model_col, excel_col in MODEL_TO_EXCEL.items():
            row_dict[excel_col] = getattr(r, model_col, "")
        data.append(row_dict)

    df = pd.DataFrame(data)
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)
    return buffer.getvalue()
