"""Excel import/export + clipboard parse router."""
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import io
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.services.excel_handler import import_excel, import_recruiters_from_excel, export_excel
from app.services.clipboard_parser import parse_clipboard_text
from app.services.settings_service import get_campaign_defaults, get_custom_column_defaults
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.email_column import EmailColumn

from app.rate_limit import limiter

_ie_logger = logging.getLogger("app.import_export")

router = APIRouter(prefix="/api/import-export", tags=["import-export"])

# Magic-byte signatures for spreadsheet files
_EXCEL_MAGIC: dict[str, list[bytes]] = {
    ".xlsx": [b"PK\x03\x04"],
    ".xls":  [b"\xd0\xcf\x11\xe0"],
}

MAX_IMPORT_SIZE = 10 * 1024 * 1024  # 10 MB


def _validate_spreadsheet(file: UploadFile, content: bytes) -> None:
    """Validate a spreadsheet upload: size + magic-byte match."""
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(400, f"File too large ({len(content) / 1024 / 1024:.1f} MB). Max: {MAX_IMPORT_SIZE / 1024 / 1024:.0f} MB")
    ext = os.path.splitext(file.filename or "file")[1].lower()
    sigs = _EXCEL_MAGIC.get(ext)
    if sigs and not any(content.startswith(sig) for sig in sigs):
        raise HTTPException(400, f"File content does not match the '{ext}' extension")


@router.post("/import-campaigns")
@limiter.limit("20/minute")
async def import_campaigns_excel(
    request: Request,
    file: UploadFile = File(...),
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Upload an Excel file and import rows into the campaigns table."""
    uid = get_user_id(auth)
    content = await file.read()
    _validate_spreadsheet(file, content)
    try:
        stats = import_excel(content, db, user_id=uid)
    except Exception as e:
        _ie_logger.error(f"Failed to parse campaigns spreadsheet: {e}")
        raise HTTPException(400, "Could not parse the spreadsheet. Ensure it is a valid Excel file with the expected columns.")
    return {"message": "Import complete", **stats}


@router.post("/import-recruiters")
@limiter.limit("20/minute")
async def import_recruiters_excel(request: Request, file: UploadFile = File(...), auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Upload an Excel file and import rows into the recruiters table."""
    uid = get_user_id(auth)
    content = await file.read()
    _validate_spreadsheet(file, content)
    from app.auth import get_user_role, is_admin_role as _is_admin_role
    try:
        stats = import_recruiters_from_excel(content, db, user_id=uid, is_admin=_is_admin_role(get_user_role(uid, db)))
    except Exception as e:
        _ie_logger.error(f"Failed to parse recruiters spreadsheet: {e}")
        raise HTTPException(400, "Could not parse the spreadsheet. Ensure it is a valid Excel file with the expected columns.")
    return {"message": "Import complete", **stats}


@router.post("/import-recruiters-bulk")
@limiter.limit("10/minute")
async def import_recruiters_bulk(request: Request, files: list[UploadFile] = File(...), auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Upload multiple Excel/CSV files and import all recruiters."""
    uid = get_user_id(auth)
    from app.auth import get_user_role, is_admin_role
    approval = "approved" if is_admin_role(get_user_role(uid, db)) else "pending"
    total_created = 0
    total_skipped = 0
    for f in files:
        content = await f.read()
        if len(content) > MAX_IMPORT_SIZE:
            raise HTTPException(400, f"File '{f.filename}' too large. Max: {MAX_IMPORT_SIZE / 1024 / 1024:.0f} MB")
        if f.filename and f.filename.endswith(".csv"):
            # Parse CSV as text, then convert to recruiter rows
            text = content.decode("utf-8", errors="replace")
            parsed = parse_clipboard_text(text)
            # Batch-check existing emails
            emails_in_batch = [row.get("email", "").strip().lower() for row in parsed["preview"] if row.get("email", "").strip()]
            existing_emails: set[str] = set()
            for i in range(0, len(emails_in_batch), 500):
                chunk = emails_in_batch[i:i+500]
                rows_db = db.query(Recruiter.email).filter(Recruiter.email.in_(chunk)).all()
                existing_emails.update(e.lower() for (e,) in rows_db)

            for row in parsed["preview"]:
                email = row.get("email", "").strip()
                if not email:
                    total_skipped += 1
                    continue
                if email.lower() in existing_emails:
                    total_skipped += 1
                    continue
                r = Recruiter(
                    name=row.get("name", ""),
                    email=email,
                    company=row.get("company", ""),
                    title=row.get("title", ""),
                    location=row.get("location", ""),
                    notes=row.get("notes", ""),
                    user_id=uid,
                    approval_status=approval,
                )
                db.add(r)
                existing_emails.add(email.lower())
                total_created += 1
            db.commit()
        else:
            stats = import_recruiters_from_excel(content, db, user_id=uid, is_admin=is_admin_role(get_user_role(uid, db)))
            total_created += stats["created"]
            total_skipped += stats["skipped"]
    return {"message": "Bulk import complete", "created": total_created, "skipped": total_skipped}


class ClipboardParseRequest(BaseModel):
    text: str


@router.post("/parse-clipboard")
def parse_clipboard(req: ClipboardParseRequest):
    """Parse CSV/TSV text with fuzzy header detection. Returns preview for confirmation."""
    result = parse_clipboard_text(req.text)
    return result


class ClipboardCommitRow(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    notes: str = ""


class CampaignDefaults(BaseModel):
    sender_email: str = ""
    template_file: str = ""


class ClipboardCommitRequest(BaseModel):
    rows: list[ClipboardCommitRow]
    target: str = "recruiters"  # "recruiters", "referrals", or "both"
    campaign_defaults: CampaignDefaults | None = None


@router.post("/commit-clipboard")
@limiter.limit("20/minute")
def commit_clipboard(req: ClipboardCommitRequest, request: Request, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """
    Commit parsed clipboard rows to the database.
    target="recruiters": only create recruiter records.
    target="both": create recruiter + campaign row for each.
    """
    uid = get_user_id(auth)
    created = 0
    existing_count = 0
    campaigns_created = 0

    # Determine which model to use
    if req.target == "referrals":
        Model = Referral
    else:
        Model = Recruiter

    from app.auth import get_user_role, is_admin_role as _is_admin
    approval = "approved" if _is_admin(get_user_role(uid, db)) else "pending"

    for row in req.rows:
        email = row.email.strip()
        if not email:
            continue

        # Upsert record
        existing = db.query(Model).filter(Model.email == email).first()
        if existing:
            record = existing
            existing_count += 1
        else:
            record = Model(
                name=row.name.strip(),
                email=email,
                company=row.company.strip(),
                title=row.title.strip(),
                location=row.location.strip(),
                notes=row.notes.strip(),
                user_id=uid,
                approval_status=approval,
            )
            db.add(record)
            db.flush()  # get record.id
            created += 1

        # Create campaign row if requested
        if req.target == "both" and req.campaign_defaults:
            defaults = get_campaign_defaults(db, uid)
            cf_defaults = get_custom_column_defaults(db, uid)
            custom_fields = cf_defaults if cf_defaults else None
            ec = EmailColumn(
                sender_email=req.campaign_defaults.sender_email,
                recipient_name=record.name,
                recipient_email=record.email,
                company=record.company,
                position=defaults["position"],
                template_file=req.campaign_defaults.template_file,
                recruiter_id=record.id,
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
        "recruiters_created": created,
        "recruiters_existing": existing_count,
        "campaigns_created": campaigns_created,
    }


@router.get("/export-campaigns")
def export_campaigns_excel(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Export current user's campaign rows to an Excel file download."""
    uid = get_user_id(auth)
    data = export_excel(db, user_id=uid)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=campaigns_export.xlsx"},
    )
