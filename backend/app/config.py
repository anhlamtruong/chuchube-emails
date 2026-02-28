import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

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
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))

# --- Auth (Clerk) ---
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    # Default: derived from CLERK_SECRET_KEY's instance ID if not explicitly set
    # You can find this at: https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
    "",
)

# --- CORS ---
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- Session ---
SESSION_TIMEOUT_SECONDS = int(os.getenv("SESSION_TIMEOUT_SECONDS", "86400"))  # 24 hours

# --- Access Key Gate ---
ACCESS_KEY_ENABLED = os.getenv("ACCESS_KEY_ENABLED", "true").lower() in ("true", "1", "yes")
ADMIN_USER_ID = os.getenv("ADMIN_USER_ID", "user_3ABxlstfC7GShKC13A9yH9iYUkH")
ACCESS_MASTER_KEY = os.getenv("ACCESS_MASTER_KEY", "")
