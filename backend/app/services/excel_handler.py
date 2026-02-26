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


def import_excel(file_bytes: bytes, db: Session) -> dict:
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

        email_col = EmailColumn(**data)
        db.add(email_col)
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}


def import_recruiters_from_excel(file_bytes: bytes, db: Session) -> dict:
    """Import recruiters from an Excel file. Deduplicates by email."""
    df = pd.read_excel(io.BytesIO(file_bytes))
    created = 0
    skipped = 0

    for _, row in df.iterrows():
        email = str(row.get("Email", "")).strip()
        if not email:
            skipped += 1
            continue

        existing = db.query(Recruiter).filter(Recruiter.email == email).first()
        if existing:
            skipped += 1
            continue

        recruiter = Recruiter(
            name=str(row.get("Name", "")).strip(),
            email=email,
            company=str(row.get("Companies", row.get("Company", ""))).strip(),
            title=str(row.get("Positions", row.get("Title", ""))).strip(),
            location=str(row.get("Location", "")).strip(),
            notes=str(row.get("Notes", "")).strip(),
        )
        db.add(recruiter)
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}


def export_excel(db: Session) -> bytes:
    """Export all EmailColumn rows to an Excel file (bytes)."""
    rows = db.query(EmailColumn).all()
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
