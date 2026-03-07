"""Bounce detection router -- bounce logs, stats, manual scan trigger, Ollama status."""
import asyncio
import threading
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id, get_user_role, is_admin_role
from app.routers.admin import require_admin
from app.models.bounce_log import BounceLog
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.sender_account import SenderAccount
from app.models.setting import Setting
from app.schemas.bounce import BounceLogOut, BounceStats, BounceScanResult, BounceScanProgress
from app.services.llm_client import llm
from app.services.settings_service import get_setting_value
from app.rate_limit import limiter
from app.logging_config import get_logger
import json

logger = get_logger("bounces")

router = APIRouter(prefix="/api/bounces", tags=["bounces"])
# Separate router for SSE endpoint (handles its own auth via query param,
# so it must NOT have require_auth as a router-level dependency).
sse_router = APIRouter(prefix="/api/bounces", tags=["bounces"])

# ─── In-memory scan progress (single-process safe) ───────────────────── #
# WARNING: This state lives in the worker process. If you scale to multiple
# workers (e.g. gunicorn with >1 worker, K8s replicas), replace with Redis
# or a database-backed solution.

_scan_lock = threading.Lock()

_scan_state: dict = {
    "status": "idle",
    "current_account": "",
    "total_accounts": 0,
    "accounts_done": 0,
    "checked": 0,
    "bounces": 0,
    "ooo": 0,
    "errors": [],
    "started_at": None,
    "finished_at": None,
    "email_events": [],       # per-email classification events for SSE
    "email_event_cursor": 0,  # last event index sent to SSE clients
}


# (require_admin is imported from app.routers.admin)


# ─── Bounce Stats (any authenticated user) ───────────────────────────── #

@router.get("/stats", response_model=BounceStats)
def bounce_stats(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Get bounce detection summary stats."""
    user_id = get_user_id(auth)

    total_bounces = db.query(func.count(BounceLog.id)).filter(
        BounceLog.bounce_type.in_(["hard", "soft"])
    ).scalar() or 0
    hard = db.query(func.count(BounceLog.id)).filter(BounceLog.bounce_type == "hard").scalar() or 0
    soft = db.query(func.count(BounceLog.id)).filter(BounceLog.bounce_type == "soft").scalar() or 0
    ooo = db.query(func.count(BounceLog.id)).filter(BounceLog.bounce_type == "ooo").scalar() or 0

    # Last check timestamp
    last_check_row = (
        db.query(func.max(SenderAccount.last_bounce_check_at)).scalar()
    )

    # Bounced / risky / total / valid contacts (recruiters + referrals combined)
    bounced_r = db.query(func.count(Recruiter.id)).filter(Recruiter.email_status == "bounced").scalar() or 0
    bounced_ref = db.query(func.count(Referral.id)).filter(Referral.email_status == "bounced").scalar() or 0
    risky_r = db.query(func.count(Recruiter.id)).filter(Recruiter.email_status == "risky").scalar() or 0
    risky_ref = db.query(func.count(Referral.id)).filter(Referral.email_status == "risky").scalar() or 0
    total_r = db.query(func.count(Recruiter.id)).scalar() or 0
    total_ref = db.query(func.count(Referral.id)).scalar() or 0
    valid_r = db.query(func.count(Recruiter.id)).filter(Recruiter.email_status == "valid").scalar() or 0
    valid_ref = db.query(func.count(Referral.id)).filter(Referral.email_status == "valid").scalar() or 0
    ooo_r = db.query(func.count(Recruiter.id)).filter(Recruiter.email_status == "ooo").scalar() or 0
    ooo_ref = db.query(func.count(Referral.id)).filter(Referral.email_status == "ooo").scalar() or 0

    # Read bounce_check_enabled from settings (per-user, fall back to env var)
    enabled_val = get_setting_value(db, user_id, "bounce_check_enabled", "")
    if enabled_val:
        enabled = enabled_val.lower() in ("true", "1", "yes")
    else:
        from app.config import BOUNCE_CHECK_ENABLED
        enabled = BOUNCE_CHECK_ENABLED

    return BounceStats(
        total_bounces=total_bounces,
        hard_bounces=hard,
        soft_bounces=soft,
        ooo_replies=ooo,
        last_check=last_check_row,
        bounced_contacts=bounced_r + bounced_ref,
        risky_contacts=risky_r + risky_ref,
        ooo_contacts=ooo_r + ooo_ref,
        total_contacts=total_r + total_ref,
        valid_contacts=valid_r + valid_ref,
        enabled=enabled,
    )


# ─── Bounce Logs (admin) ─────────────────────────────────────────────── #

@router.get("/logs", response_model=list[BounceLogOut])
def list_bounce_logs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    bounce_type: str | None = Query(None),
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List bounce log entries (admin only)."""
    q = db.query(BounceLog).order_by(BounceLog.created_at.desc())
    if bounce_type:
        q = q.filter(BounceLog.bounce_type == bounce_type)
    return q.offset(offset).limit(limit).all()


# ─── Manual scan trigger (admin) -- async with progress ────────────────── #

def _update_scan_progress(accounts_done: int, total: int, email: str, stats: dict):
    """Callback invoked by run_full_scan after each account."""
    with _scan_lock:
        _scan_state["accounts_done"] = accounts_done
        _scan_state["total_accounts"] = total
        _scan_state["current_account"] = email
        _scan_state["checked"] = stats.get("checked", 0)
        _scan_state["bounces"] = stats.get("bounces", 0)
        _scan_state["ooo"] = stats.get("ooo", 0)
        _scan_state["errors"] = stats.get("errors", [])[:]


def _email_event_callback(event: dict):
    """Callback invoked per-email classification -- appends to the SSE feed."""
    with _scan_lock:
        events: list = _scan_state["email_events"]
        events.append(event)
        # Cap at 2000 to avoid unbounded memory
        if len(events) > 2000:
            _scan_state["email_events"] = events[-1500:]


def _run_scan_thread():
    """Background thread that runs the full scan and updates _scan_state."""
    from app.services.bounce_scanner import run_full_scan
    from app.database import SessionLocal

    # Read scan config from DB
    since_days = 3
    max_messages = 200
    try:
        db = SessionLocal()
        from app.models.user_role import UserRole
        master = db.query(UserRole.user_id).filter(UserRole.role == "master_admin").first()
        uid = master[0] if master else ""
        since_val = get_setting_value(db, uid, "bounce_scan_since_days", "3")
        max_val = get_setting_value(db, uid, "bounce_scan_max_messages", "200")
        since_days = max(1, min(30, int(since_val)))
        max_messages = max(50, min(1000, int(max_val)))
        db.close()
    except Exception as e:
        logger.debug(f"Failed to read bounce scan config, using defaults: {e}")

    try:
        stats = run_full_scan(
            progress_callback=_update_scan_progress,
            email_callback=_email_event_callback,
            since_days=since_days,
            max_messages=max_messages,
        )
        with _scan_lock:
            _scan_state["status"] = "done"
            _scan_state["checked"] = stats.get("checked", 0)
            _scan_state["bounces"] = stats.get("bounces", 0)
            _scan_state["ooo"] = stats.get("ooo", 0)
            _scan_state["errors"] = stats.get("errors", [])[:]            
            _scan_state["accounts_done"] = stats.get("accounts", 0)
    except Exception as e:
        logger.error(f"Background scan failed: {e}")
        with _scan_lock:
            _scan_state["status"] = "error"
            _scan_state["errors"] = [str(e)]
    finally:
        with _scan_lock:
            _scan_state["finished_at"] = datetime.now(tz=timezone.utc).isoformat()
            _scan_state["current_account"] = ""


@router.post("/scan")
@limiter.limit("5/minute")
def trigger_scan(request: Request, auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Kick off a full bounce scan.

    Returns immediately with {status: 'started'}.  Poll GET /scan/status
    for real-time progress.
    """
    if _scan_state["status"] == "running":
        raise HTTPException(409, "A scan is already in progress")

    # Reset state
    with _scan_lock:
        _scan_state.update({
            "status": "running",
            "current_account": "",
            "total_accounts": 0,
            "accounts_done": 0,
            "checked": 0,
            "bounces": 0,
            "ooo": 0,
            "errors": [],
            "started_at": datetime.now(tz=timezone.utc).isoformat(),
            "finished_at": None,
            "email_events": [],
            "email_event_cursor": 0,
        })

    t = threading.Thread(target=_run_scan_thread, daemon=True)
    t.start()
    return {"status": "started"}


@router.get("/scan/status", response_model=BounceScanProgress)
def scan_status(auth: dict = Depends(require_admin)):
    """Return current progress of the running (or last completed) scan."""
    with _scan_lock:
        return BounceScanProgress(**{k: v for k, v in _scan_state.items()
                                      if k not in ("email_events", "email_event_cursor")})


@sse_router.get("/scan/stream")
async def scan_stream(request: Request, token: str = Query(...)):
    """SSE stream of per-email classification events during a running scan.

    Uses token query param since EventSource cannot set headers.
    Each event is a JSON object: {subject, from_addr, classification, method, account}
    The stream ends when the scan finishes.
    """
    # Verify admin auth via query token
    from app.services.sse_auth import verify_sse_token
    try:
        uid, admin = verify_sse_token(token)
        if not admin:
            raise HTTPException(403, "Admin access required")
    except HTTPException:
        raise

    cursor = 0

    async def event_generator():
        nonlocal cursor
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            with _scan_lock:
                events: list = list(_scan_state.get("email_events", []))
                status = _scan_state.get("status", "idle")

            # Yield any new events since our cursor
            while cursor < len(events):
                evt = events[cursor]
                cursor += 1
                yield {
                    "event": "email",
                    "data": json.dumps(evt),
                }

            # Check if scan is done
            if status in ("done", "error", "idle"):
                # Flush remaining events (re-read under lock)
                with _scan_lock:
                    events = list(_scan_state.get("email_events", []))
                while cursor < len(events):
                    evt = events[cursor]
                    cursor += 1
                    yield {
                        "event": "email",
                        "data": json.dumps(evt),
                    }
                # Send completion event
                yield {
                    "event": "done",
                    "data": json.dumps({"status": status}),
                }
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


# ─── Scan config (admin) ─────────────────────────────────────────────── #

@router.get("/scan-config")
def get_scan_config(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Get configurable scan parameters."""
    uid = get_user_id(auth)
    since_days = get_setting_value(db, uid, "bounce_scan_since_days", "3")
    max_messages = get_setting_value(db, uid, "bounce_scan_max_messages", "200")
    return {
        "since_days": int(since_days),
        "max_messages": int(max_messages),
    }


@router.put("/scan-config")
def update_scan_config(
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
    since_days: int = Query(3, ge=1, le=30),
    max_messages: int = Query(200, ge=50, le=1000),
):
    """Update configurable scan parameters."""
    uid = get_user_id(auth)

    for key, value in [("bounce_scan_since_days", str(since_days)),
                       ("bounce_scan_max_messages", str(max_messages))]:
        setting = db.query(Setting).filter(
            Setting.user_id == uid, Setting.key == key,
        ).first()
        if setting:
            setting.value = value
        else:
            db.add(Setting(user_id=uid, key=key, value=value,
                           description=f"Bounce scan config: {key}"))
    db.commit()
    return {"since_days": since_days, "max_messages": max_messages}


# ─── OOO Management (admin) ──────────────────────────────────────────── #

@router.get("/ooo-contacts")
def list_ooo_contacts(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """List all contacts with OOO notes -- recruiters and referrals combined."""
    import re as _re
    results = []

    for Model, contact_type in [(Recruiter, "recruiter"), (Referral, "referral")]:
        # Find contacts whose notes start with [OOO ...]
        rows = db.query(Model).filter(Model.notes.like("[OOO %")).all()
        for row in rows:
            # Parse the OOO note from notes field
            m = _re.match(r"^\[OOO\s+(\d{4}-\d{2}-\d{2})\]\s*(.+?)(?:\n|$)", row.notes or "")
            ooo_date = m.group(1) if m else None
            ooo_message = m.group(2) if m else (row.notes[:100] if row.notes else "")

            results.append({
                "id": row.id,
                "type": contact_type,
                "name": row.name,
                "email": row.email,
                "company": row.company,
                "ooo_date": ooo_date,
                "ooo_message": ooo_message,
                "ooo_return_date": row.ooo_return_date.isoformat() if row.ooo_return_date else None,
                "email_status": row.email_status,
            })

    # Sort by OOO date descending (most recent first)
    results.sort(key=lambda x: x.get("ooo_date") or "", reverse=True)
    return results


@router.post("/ooo-clear")
def clear_ooo_contacts(
    body: dict,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear OOO notes from specified contacts (or all if clear_all=True).

    Body: { "contact_ids": ["uuid1", ...] } or { "clear_all": true }
    """
    import re as _re
    contact_ids = body.get("contact_ids")
    clear_all = body.get("clear_all", False)
    cleared = 0

    for Model in [Recruiter, Referral]:
        if clear_all:
            rows = db.query(Model).filter(Model.notes.like("[OOO %")).all()
        elif contact_ids:
            rows = db.query(Model).filter(Model.id.in_(contact_ids)).all()
        else:
            rows = []

        for row in rows:
            if not row.notes or not row.notes.startswith("[OOO"):
                continue
            # Remove the [OOO ...] prefix line
            row.notes = _re.sub(r"^\[OOO\s+\d{4}-\d{2}-\d{2}\]\s*[^\n]*\n?", "", row.notes)
            row.ooo_return_date = None
            # Reset email_status from "ooo" back to "valid"
            if row.email_status == "ooo":
                row.email_status = "valid"
            cleared += 1

    db.commit()
    logger.info(f"Cleared OOO notes from {cleared} contacts")
    return {"cleared": cleared}


@router.post("/ooo-expire")
def expire_ooo_contacts(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Auto-expire OOO notes where return date has passed."""
    import re as _re
    from datetime import date as _date

    today = _date.today()
    expired = 0

    for Model in [Recruiter, Referral]:
        rows = db.query(Model).filter(
            Model.ooo_return_date != None,  # noqa: E711
            Model.ooo_return_date <= today,
        ).all()
        for row in rows:
            row.notes = _re.sub(r"^\[OOO\s+\d{4}-\d{2}-\d{2}\]\s*[^\n]*\n?", "", row.notes or "")
            row.ooo_return_date = None
            # Reset email_status from "ooo" back to "valid"
            if row.email_status == "ooo":
                row.email_status = "valid"
            expired += 1

    db.commit()
    logger.info(f"Auto-expired OOO for {expired} contacts")
    return {"expired": expired}


# ─── Ollama / AI status (admin) ──────────────────────────────────────── #

@router.get("/ollama-status")
def ollama_status(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Check Ollama availability and model status."""
    available = llm.is_available()
    models = llm.list_models() if available else []
    from app.config import OLLAMA_MODEL
    uid = get_user_id(auth)
    enabled_val = get_setting_value(db, uid, "bounce_check_enabled", "true")
    enabled = enabled_val.lower() in ("true", "1", "yes")
    return {
        "available": available,
        "configured_model": OLLAMA_MODEL,
        "local_models": models,
        "model_ready": any(OLLAMA_MODEL in m for m in models),
        "bounce_check_enabled": enabled,
    }


@router.post("/ollama-pull")
def ollama_pull_model(auth: dict = Depends(require_admin)):
    """Trigger model pull in a background thread."""
    def _pull():
        llm.ensure_model()
    t = threading.Thread(target=_pull, daemon=True)
    t.start()
    return {"status": "pull_started", "model": llm.model}


@router.post("/ollama-test")
def ollama_test(auth: dict = Depends(require_admin)):
    """Run a quick AI classification test with a sample bounce email.

    Returns the classification result, raw model response, and time taken --
    proving that Ollama is alive and the model works.
    """
    import time as _time

    sample_emails = [
        {
            "label": "Hard Bounce (undeliverable)",
            "text": (
                "Subject: Mail delivery failed: returning message to sender\n\n"
                "This message was created automatically by mail delivery software.\n"
                "A message that you sent could not be delivered to one or more\n"
                "of its recipients. The following address failed:\n"
                "    john.doe@example.com\n"
                "SMTP error from remote server: 550 5.1.1 The email account "
                "that you tried to reach does not exist."
            ),
        },
        {
            "label": "Out of Office",
            "text": (
                "Subject: Out of Office Re: Follow up on our conversation\n\n"
                "Hi, thank you for your email. I am currently out of the office "
                "from February 14 to February 28 with limited access to email. "
                "I will respond to your message when I return. For urgent matters, "
                "please contact my colleague Sarah at sarah@example.com."
            ),
        },
        {
            "label": "Soft Bounce (mailbox full)",
            "text": (
                "Subject: Undelivered Mail Returned to Sender\n\n"
                "This is the mail system at host mail.example.com.\n"
                "I'm sorry to have to inform you that your message could not\n"
                "be delivered. The recipient's mailbox is full and cannot\n"
                "receive messages at this time. Please try again later.\n"
                "452 4.2.2 Mailbox full"
            ),
        },
    ]

    results = []
    total_start = _time.time()

    for sample in sample_emails:
        t0 = _time.time()
        category = llm.classify(
            text=sample["text"],
            categories=["hard_bounce", "soft_bounce", "ooo", "normal"],
            system_prompt="You are an email classifier. Classify the email.",
        )
        elapsed = round(_time.time() - t0, 2)
        results.append({
            "test_label": sample["label"],
            "input_preview": sample["text"][:120] + "…",
            "classification": category,
            "time_seconds": elapsed,
        })

    total_elapsed = round(_time.time() - total_start, 2)

    return {
        "model": llm.model,
        "healthy": llm.is_healthy,
        "consecutive_failures": llm._consecutive_failures,
        "results": results,
        "total_time_seconds": total_elapsed,
    }


# ─── Toggle bounce scanning (admin) ──────────────────────────────────── #

@router.get("/toggle")
def get_bounce_toggle(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Get current bounce scanning enabled state."""
    uid = get_user_id(auth)
    val = get_setting_value(db, uid, "bounce_check_enabled", "true")
    return {"enabled": val.lower() in ("true", "1", "yes")}


@router.post("/toggle")
def toggle_bounce_scanning(auth: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """Toggle bounce scanning on/off. Persisted in settings table."""
    uid = get_user_id(auth)
    current = get_setting_value(db, uid, "bounce_check_enabled", "true")
    is_enabled = current.lower() in ("true", "1", "yes")
    new_value = "false" if is_enabled else "true"

    # Upsert the setting
    setting = db.query(Setting).filter(
        Setting.user_id == uid,
        Setting.key == "bounce_check_enabled",
    ).first()
    if setting:
        setting.value = new_value
    else:
        db.add(Setting(
            user_id=uid,
            key="bounce_check_enabled",
            value=new_value,
            description="Enable or disable automatic bounce scanning",
        ))
    db.commit()

    new_enabled = new_value == "true"
    logger.info(f"Bounce scanning {'enabled' if new_enabled else 'disabled'} by {uid}")
    return {"enabled": new_enabled}


# ─── Reset contact status (admin) ────────────────────────────────────── #

@router.post("/reset-status/{email}")
def reset_contact_status(
    email: str,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reset a contact's email_status back to 'valid'."""
    updated = False
    rec = db.query(Recruiter).filter(Recruiter.email == email).first()
    if rec:
        rec.email_status = "valid"
        updated = True
    ref = db.query(Referral).filter(Referral.email == email).first()
    if ref:
        ref.email_status = "valid"
        updated = True
    if not updated:
        raise HTTPException(404, "Contact not found")
    db.commit()
    return {"status": "reset", "email": email}
