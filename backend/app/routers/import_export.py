"""Excel import/export + clipboard parse router."""
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import io
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.services.excel_handler import import_excel, import_recruiters_from_excel, export_excel
from app.services.clipboard_parser import parse_clipboard_text
from app.services.settings_service import get_campaign_defaults
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.email_column import EmailColumn

router = APIRouter(prefix="/api/import-export", tags=["import-export"])


@router.post("/import-campaigns")
async def import_campaigns_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an Excel file and import rows into the campaigns table."""
    content = await file.read()
    stats = import_excel(content, db)
    return {"message": "Import complete", **stats}


@router.post("/import-recruiters")
async def import_recruiters_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an Excel file and import rows into the recruiters table."""
    content = await file.read()
    stats = import_recruiters_from_excel(content, db)
    return {"message": "Import complete", **stats}


@router.post("/import-recruiters-bulk")
async def import_recruiters_bulk(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    """Upload multiple Excel/CSV files and import all recruiters."""
    total_created = 0
    total_skipped = 0
    for f in files:
        content = await f.read()
        if f.filename and f.filename.endswith(".csv"):
            # Parse CSV as text, then convert to recruiter rows
            text = content.decode("utf-8", errors="replace")
            parsed = parse_clipboard_text(text)
            for row in parsed["preview"]:
                email = row.get("email", "").strip()
                if not email:
                    total_skipped += 1
                    continue
                existing = db.query(Recruiter).filter(Recruiter.email == email).first()
                if existing:
                    total_skipped += 1
                    continue
                r = Recruiter(
                    name=row.get("name", ""),
                    email=email,
                    company=row.get("company", ""),
                    title=row.get("title", ""),
                    location=row.get("location", ""),
                    notes=row.get("notes", ""),
                )
                db.add(r)
                total_created += 1
            db.commit()
        else:
            stats = import_recruiters_from_excel(content, db)
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
def commit_clipboard(req: ClipboardCommitRequest, auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
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
            )
            db.add(record)
            db.flush()  # get record.id
            created += 1

        # Create campaign row if requested
        if req.target == "both" and req.campaign_defaults:
            defaults = get_campaign_defaults(db, uid)
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
def export_campaigns_excel(db: Session = Depends(get_db)):
    """Export all campaign rows to an Excel file download."""
    data = export_excel(db)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=campaigns_export.xlsx"},
    )
