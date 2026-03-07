"""Backup status router — admin-only read access to backup pipeline state.

Reads backup metadata from the shared volume (backup_state.json) and lists
available backup files. Also supports triggering a manual backup.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_auth, get_user_id, get_user_role, is_admin_role
from app.logging_config import get_logger

logger = get_logger("backup")

router = APIRouter(prefix="/api/admin/backup", tags=["backup"])

# The backup volume mount point — in Docker this is /backups,
# but the backend reads it via a shared path. If the volume isn't
# mounted (e.g. local dev), endpoints return graceful "not configured" responses.
BACKUP_DIR = os.getenv("BACKUP_DIR", "/backups")


def _require_admin(auth: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Admin gate — reuses the same pattern as the admin router."""
    uid = get_user_id(auth)
    role = get_user_role(uid, db)
    if not is_admin_role(role):
        raise HTTPException(403, "Admin access required")
    return auth


# ─── Schemas ──────────────────────────────────────────────────────────────

class BackupStatus(BaseModel):
    last_backup_at: Optional[str] = None
    status: str  # "success", "error", "stale", "not_configured"
    file: Optional[str] = None
    size_bytes: int = 0
    duration_seconds: int = 0
    error: Optional[str] = None


class BackupFile(BaseModel):
    name: str
    size_bytes: int
    created_at: str
    is_encrypted: bool


class ExportFile(BaseModel):
    name: str
    table: str  # "recruiters" or "referrals"
    size_bytes: int
    row_count: Optional[int] = None
    created_at: str


class BackupListResponse(BaseModel):
    backups: list[BackupFile]
    total_size_bytes: int


class TriggerResponse(BaseModel):
    message: str
    triggered: bool


# ─── Helpers ──────────────────────────────────────────────────────────────

def _read_state() -> dict:
    """Read backup_state.json from the shared backup volume."""
    state_path = os.path.join(BACKUP_DIR, "backup_state.json")
    if not os.path.exists(state_path):
        return {}
    try:
        with open(state_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Failed to read backup state: {e}")
        return {}


def _is_backup_dir_available() -> bool:
    """Check if the backup directory is mounted and accessible."""
    return os.path.isdir(BACKUP_DIR)


# ─── Endpoints ────────────────────────────────────────────────────────────

@router.get("/status", response_model=BackupStatus)
def get_backup_status(auth=Depends(_require_admin)):
    """Return the current backup pipeline status.

    Returns stale status if the last successful backup is older than 26 hours.
    """
    if not _is_backup_dir_available():
        return BackupStatus(status="not_configured")

    state = _read_state()
    if not state:
        return BackupStatus(status="not_configured")

    result = BackupStatus(
        last_backup_at=state.get("last_backup_at"),
        status=state.get("status", "unknown"),
        file=state.get("file"),
        size_bytes=state.get("size_bytes", 0),
        duration_seconds=state.get("duration_seconds", 0),
        error=state.get("error"),
    )

    # Mark as stale if last backup > 26 hours ago
    if result.last_backup_at and result.status == "success":
        try:
            last_dt = datetime.fromisoformat(result.last_backup_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
            if age_hours > 26:
                result.status = "stale"
        except (ValueError, TypeError):
            pass

    return result


@router.get("/exports", response_model=list[ExportFile])
def list_export_files(
    table: Optional[str] = Query(default=None, regex="^(recruiters|referrals)$"),
    auth=Depends(_require_admin),
):
    """List available CSV exports of recruiters and referrals."""
    export_dir = Path(BACKUP_DIR) / "exports"
    if not export_dir.is_dir():
        return []

    exports = []
    for f in sorted(export_dir.glob("*.csv"), reverse=True):
        # Skip "_latest" symlinks
        if f.is_symlink():
            continue
        # Determine table name from filename: recruiters_20250307T...csv
        fname = f.stem  # e.g. "recruiters_20250307T120000Z"
        tbl = fname.split("_")[0] if "_" in fname else "unknown"
        if table and tbl != table:
            continue

        stat = f.stat()
        # Count rows (lines minus header)
        try:
            with open(f, "r") as fh:
                row_count = max(sum(1 for _ in fh) - 1, 0)
        except IOError:
            row_count = None

        exports.append(ExportFile(
            name=f.name,
            table=tbl,
            size_bytes=stat.st_size,
            row_count=row_count,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        ))

    return exports


@router.get("/files", response_model=BackupListResponse)
def list_backup_files(auth=Depends(_require_admin)):
    """List available backup files with metadata."""
    if not _is_backup_dir_available():
        return BackupListResponse(backups=[], total_size_bytes=0)

    backups = []
    total_size = 0
    backup_path = Path(BACKUP_DIR)

    for f in sorted(backup_path.glob("chuchube_*.dump*"), reverse=True):
        stat = f.stat()
        size = stat.st_size
        total_size += size
        backups.append(BackupFile(
            name=f.name,
            size_bytes=size,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            is_encrypted=f.suffix == ".gpg",
        ))

    return BackupListResponse(backups=backups, total_size_bytes=total_size)


@router.post("/trigger", response_model=TriggerResponse)
def trigger_manual_backup(auth=Depends(_require_admin)):
    """Request an immediate backup by writing a trigger file.

    The backup container polls for this file every 30 seconds.
    """
    if not _is_backup_dir_available():
        raise HTTPException(503, "Backup volume not mounted")

    trigger_path = os.path.join(BACKUP_DIR, ".trigger")

    if os.path.exists(trigger_path):
        return TriggerResponse(message="A backup trigger is already pending", triggered=False)

    try:
        with open(trigger_path, "w") as f:
            f.write(datetime.now(timezone.utc).isoformat())
        logger.info("Manual backup triggered by admin")
        return TriggerResponse(message="Backup triggered — will start within 30 seconds", triggered=True)
    except IOError as e:
        logger.error(f"Failed to write trigger file: {e}")
        raise HTTPException(500, "Failed to trigger backup")


@router.get("/log")
def get_backup_log(
    lines: int = Query(default=50, ge=1, le=500),
    auth=Depends(_require_admin),
):
    """Return the last N lines of the backup log."""
    if not _is_backup_dir_available():
        return {"log": "Backup volume not mounted"}

    log_path = os.path.join(BACKUP_DIR, "backup.log")
    if not os.path.exists(log_path):
        return {"log": "No backup log found"}

    try:
        with open(log_path, "r") as f:
            all_lines = f.readlines()
        return {"log": "".join(all_lines[-lines:])}
    except IOError:
        return {"log": "Failed to read backup log"}
