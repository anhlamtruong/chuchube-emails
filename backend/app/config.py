import os
import logging
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

_config_logger = logging.getLogger("app.config")

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent.parent
# Assets: check multiple locations (local dev vs Docker)
_assets_candidates = [
    BASE_DIR / "assets",
    BASE_DIR.parent / "sending_email" / "assets",
    Path("/app/sending_email/assets"),
]
ASSETS_DIR = next((p for p in _assets_candidates if p.is_dir()), BASE_DIR / "assets")
SELFIE_DIR = ASSETS_DIR / "selfie"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'data.db'}")

# --- Supabase Storage ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "documents")

# --- Sender Info ---
YOUR_NAME = os.getenv("YOUR_NAME", "")
YOUR_PHONE_NUMBER = os.getenv("YOUR_PHONE", "")
YOUR_STATE_AND_CITY = os.getenv("YOUR_CITY_STATE", "")

# --- SMTP ---
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
try:
    SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
except ValueError:
    _config_logger.warning("Invalid SMTP_PORT value, falling back to 465")
    SMTP_PORT = 465

# --- Auth (Clerk) ---
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    # Default: derived from CLERK_SECRET_KEY's instance ID if not explicitly set
    # You can find this at: https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
    "",
)

# --- CORS ---
# In production, set FRONTEND_URL to your HTTPS origin (e.g. https://yourdomain.com).
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- Session ---
SESSION_TIMEOUT_SECONDS = int(os.getenv("SESSION_TIMEOUT_SECONDS", "86400"))  # 24 hours

# --- Access Key Gate ---
ACCESS_KEY_ENABLED = os.getenv("ACCESS_KEY_ENABLED", "true").lower() in ("true", "1", "yes")
# DEPRECATED: ADMIN_USER_ID is used only by Alembic migrations (019, 021) for seeding.
# Role management is now DB-backed via the user_roles table.
# Set this in .env for fresh-database migrations; no runtime code uses it.
ADMIN_USER_ID = os.getenv("ADMIN_USER_ID", "")
ACCESS_MASTER_KEY = os.getenv("ACCESS_MASTER_KEY", "")

# --- Ollama / LLM ---
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

# --- Bounce Detection ---
try:
    BOUNCE_CHECK_INTERVAL = int(os.getenv("BOUNCE_CHECK_INTERVAL", "300"))  # seconds
except ValueError:
    _config_logger.warning("Invalid BOUNCE_CHECK_INTERVAL value, falling back to 300")
    BOUNCE_CHECK_INTERVAL = 300
BOUNCE_CHECK_ENABLED = os.getenv("BOUNCE_CHECK_ENABLED", "true").lower() in ("true", "1", "yes")

# --- Backup ---
# BACKUP_DATABASE_URL: Direct Supabase connection (port 5432, NOT the PgBouncer pooler).
#   PgBouncer's transaction mode is incompatible with pg_dump.
#   Format: postgresql://user:pass@db.<project>.supabase.co:5432/postgres
BACKUP_DATABASE_URL = os.getenv("BACKUP_DATABASE_URL", "")
# LOCAL_DB_URL: Target local PostgreSQL instance for restoring backups.
LOCAL_DB_URL = os.getenv("LOCAL_DB_URL", "")
# BACKUP_CRON: Cron expression for scheduled backups (default: daily at 3 AM UTC).
BACKUP_CRON = os.getenv("BACKUP_CRON", "0 3 * * *")
# BACKUP_RETENTION_DAYS: How many days to keep old backup files.
try:
    BACKUP_RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
except ValueError:
    _config_logger.warning("Invalid BACKUP_RETENTION_DAYS, falling back to 7")
    BACKUP_RETENTION_DAYS = 7
# BACKUP_ENCRYPTION_KEY: GPG passphrase for at-rest encryption (leave empty to disable).
BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")


def validate_config() -> None:
    """Check that critical configuration values are present and warn on gaps.

    Called at application startup so problems surface immediately.
    """
    _required = {
        "DATABASE_URL": DATABASE_URL,
    }
    for name, value in _required.items():
        if not value or value.startswith("sqlite"):
            _config_logger.warning(f"Config: {name} is not set or using default SQLite — this is not suitable for production")

    _important = {
        "CLERK_SECRET_KEY": CLERK_SECRET_KEY,
        "CLERK_JWKS_URL": CLERK_JWKS_URL,
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SERVICE_KEY": SUPABASE_SERVICE_KEY,
    }
    for name, value in _important.items():
        if not value:
            _config_logger.warning(f"Config: {name} is empty — some features will be unavailable")

    if ACCESS_KEY_ENABLED and not ACCESS_MASTER_KEY:
        _config_logger.warning("Config: ACCESS_KEY_ENABLED is true but ACCESS_MASTER_KEY is empty")
