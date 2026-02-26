"""FastAPI main application — entry point."""
import os
import re
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

from app import config
from app.database import init_db, get_db, SessionLocal
from app.auth import require_auth
from app.logging_config import setup_logging, get_logger
from app.models.template import Template
from app.models.recruiter import Recruiter
from app.models.email_column import EmailColumn
from app.models.document import Document
from app.models.setting import Setting, DEFAULT_SETTINGS
from app.models.user_consent import UserConsent  # noqa: F401 – register model
from app.models.referral import Referral  # noqa: F401 – register model
from app.models.sender_account import SenderAccount  # noqa: F401 – register model

from app.routers import recruiters, referrals, campaigns, templates, emails, import_export, documents, settings, consent, sender_accounts
from app.background import start_scheduler, stop_scheduler


def seed_templates():
    """Seed templates from existing HTML files on first run."""
    # Check multiple possible paths (local dev vs Docker)
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "sending_email", "templates"),
        "/app/sending_email/templates",
    ]
    template_folder = None
    for path in candidates:
        if os.path.isdir(path):
            template_folder = path
            break
    if not template_folder:
        return

    db = SessionLocal()
    try:
        for filename in os.listdir(template_folder):
            if not filename.endswith(".html"):
                continue
            name = filename.replace(".html", "")
            existing = db.query(Template).filter(Template.name == name).first()
            if existing:
                continue

            filepath = os.path.join(template_folder, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                full_content = f.read()

            parts = re.split(r"\s*---\s*", full_content, 1)
            if len(parts) == 2:
                subject = parts[0].replace("Subject: ", "").strip()
                body = parts[1].strip()
            else:
                subject = ""
                body = full_content.strip()

            t = Template(name=name, subject_line=subject, body_html=body)
            db.add(t)

        db.commit()
    finally:
        db.close()


def seed_settings():
    """Seed default settings on first run."""
    db = SessionLocal()
    try:
        for key, (default_value, description) in DEFAULT_SETTINGS.items():
            existing = db.query(Setting).filter(Setting.key == key).first()
            if existing:
                continue
            # Override defaults with env vars where available
            env_overrides = {
                "your_name": config.YOUR_NAME,
                "your_phone": config.YOUR_PHONE_NUMBER,
                "your_city_state": config.YOUR_STATE_AND_CITY,
                "smtp_server": config.SMTP_SERVER,
                "smtp_port": str(config.SMTP_PORT),
            }
            value = env_overrides.get(key, default_value)
            if not value:
                value = default_value
            s = Setting(key=key, value=value, description=description)
            db.add(s)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger = get_logger("startup")
    logger.info("Starting Email Campaign Manager")
    init_db()
    seed_templates()
    seed_settings()
    start_scheduler()
    logger.info("Startup complete")
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="Email Campaign Manager",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Convert any unhandled DB unique/FK violation into a 409 instead of a 500 crash."""
    detail = str(exc.orig) if exc.orig else str(exc)
    return JSONResponse(status_code=409, content={"detail": detail})


# --- Protected routes (Clerk JWT verification) ---
app.include_router(recruiters.router, dependencies=[Depends(require_auth)])
app.include_router(referrals.router, dependencies=[Depends(require_auth)])
app.include_router(campaigns.router, dependencies=[Depends(require_auth)])
app.include_router(templates.router, dependencies=[Depends(require_auth)])
app.include_router(emails.router, dependencies=[Depends(require_auth)])
app.include_router(import_export.router, dependencies=[Depends(require_auth)])
app.include_router(documents.router, dependencies=[Depends(require_auth)])
app.include_router(settings.router, dependencies=[Depends(require_auth)])
app.include_router(consent.router, dependencies=[Depends(require_auth)])
app.include_router(sender_accounts.router, dependencies=[Depends(require_auth)])


# --- Health check ---
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(auth=Depends(require_auth)):
    from app.auth import get_user_id
    uid = get_user_id(auth)
    db = SessionLocal()
    try:
        from sqlalchemy import func

        total_recruiters = db.query(Recruiter).count()
        total_campaigns = db.query(EmailColumn).filter(EmailColumn.user_id == uid).count()
        statuses = (
            db.query(EmailColumn.sent_status, func.count())
            .filter(EmailColumn.user_id == uid)
            .group_by(EmailColumn.sent_status)
            .all()
        )
        # Upcoming scheduled jobs for this user
        from app.models.job_result import JobResult
        upcoming = (
            db.query(JobResult)
            .filter(JobResult.status.in_(["queued", "scheduled"]))
            .order_by(JobResult.created_at.desc())
            .limit(5)
            .all()
        )
        return {
            "total_recruiters": total_recruiters,
            "total_campaigns": total_campaigns,
            "by_status": {s: c for s, c in statuses},
            "upcoming_jobs": [
                {
                    "job_id": jr.id,
                    "status": jr.status,
                    "total": jr.total,
                    "sent": jr.sent,
                    "created_at": jr.created_at.isoformat() if jr.created_at else None,
                }
                for jr in upcoming
            ],
        }
    finally:
        db.close()
