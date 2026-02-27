"""FastAPI main application — entry point."""
import os
import re
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app import config
from app.database import init_db, get_db, SessionLocal
from app.auth import require_auth, get_user_id
from app.logging_config import setup_logging, get_logger
from app.models.template import Template
from app.models.recruiter import Recruiter
from app.models.email_column import EmailColumn
from app.models.document import Document
from app.models.setting import Setting
from app.models.user_consent import UserConsent  # noqa: F401 – register model
from app.models.referral import Referral  # noqa: F401 – register model
from app.models.sender_account import SenderAccount  # noqa: F401 – register model
from app.models.audit_log import AuditLog  # noqa: F401 – register model
from app.models.custom_column import CustomColumnDefinition  # noqa: F401 – register model
from app.models.access_key import AccessKey  # noqa: F401 – register model

from app.routers import recruiters, referrals, campaigns, templates, emails, import_export, documents, settings, consent, sender_accounts, audit_logs, custom_columns
from app.routers import admin as admin_router
from app.background import start_scheduler, stop_scheduler


def _rate_limit_key(request: Request) -> str:
    """Use authenticated user_id as rate-limit key, fallback to IP."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from app.auth import verify_clerk_token
            payload = verify_clerk_token(auth_header.split(" ", 1)[1])
            uid = payload.get("sub")
            if uid:
                return uid
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key, default_limits=["200/minute"])


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger = get_logger("startup")
    logger.info("Starting ChuChuBe Emails")
    init_db()
    seed_templates()
    start_scheduler()
    logger.info("Startup complete")
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="ChuChuBe Emails",
    description="Personalized email campaign management API",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(audit_logs.router, dependencies=[Depends(require_auth)])
app.include_router(custom_columns.router, dependencies=[Depends(require_auth)])
app.include_router(admin_router.router, dependencies=[Depends(require_auth)])


# --- Access key validation middleware ---
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse as StarletteJSONResponse

class AccessKeyMiddleware(BaseHTTPMiddleware):
    """Validate X-Access-Key on every authenticated API request.

    Exempt paths: /api/health, /api/auth/validate-access-key, /api/admin/*
    """
    EXEMPT_PREFIXES = ("/api/health", "/api/auth/validate-access-key", "/api/admin/")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Skip non-API routes and exempt paths
        if not path.startswith("/api") or any(path.startswith(p) for p in self.EXEMPT_PREFIXES):
            return await call_next(request)

        # Only validate if there's an auth token (unauthenticated requests handled by require_auth)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from app.auth import verify_clerk_token, validate_access_key
                payload = verify_clerk_token(auth_header.split(" ", 1)[1])
                uid = payload.get("sub")
                if uid:
                    db = SessionLocal()
                    try:
                        validate_access_key(request, uid, db)
                    except HTTPException as e:
                        return StarletteJSONResponse(
                            status_code=e.status_code,
                            content={"detail": e.detail},
                        )
                    finally:
                        db.close()
            except Exception:
                pass  # Let the actual endpoint handler deal with auth errors

        return await call_next(request)


from app.config import ACCESS_KEY_ENABLED
if ACCESS_KEY_ENABLED:
    app.add_middleware(AccessKeyMiddleware)


# --- Access key validation endpoint (pre-auth) ---
from pydantic import BaseModel as PydanticBaseModel

class _AccessKeyValidateBody(PydanticBaseModel):
    key: str

@app.post("/api/auth/validate-access-key")
def validate_access_key_endpoint(body: _AccessKeyValidateBody):
    """Public endpoint to check if an access key is valid (before login)."""
    from app.models.access_key import AccessKey as AK
    db = SessionLocal()
    try:
        ak = db.query(AK).filter(AK.key == body.key, AK.is_active == True).first()  # noqa: E712
        if not ak:
            raise HTTPException(403, "Invalid or revoked access key")
        return {"valid": True, "label": ak.label}
    finally:
        db.close()


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
