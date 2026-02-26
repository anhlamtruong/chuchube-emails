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

# --- Multi-sender email credentials ---
EMAIL_CREDENTIALS: dict[str, str] = {}
RESUME_MAPPING: dict[str, str] = {}

for i in range(1, 10):
    email = os.getenv(f"SENDER_EMAIL_{i}")
    password = os.getenv(f"SENDER_PASSWORD_{i}")
    if email and password:
        EMAIL_CREDENTIALS[email] = password

    resume = os.getenv(f"SENDER_RESUME_{i}")
    if email and resume:
        RESUME_MAPPING[email] = resume

# Backward compat: original SENDER_EMAIL_1/2 resume mapping
if os.getenv("SENDER_EMAIL_1") and not RESUME_MAPPING.get(os.getenv("SENDER_EMAIL_1")):
    RESUME_MAPPING[os.getenv("SENDER_EMAIL_1")] = str(ASSETS_DIR / "Lam_Anh_Truong_Resume.pdf")
if os.getenv("SENDER_EMAIL_2") and not RESUME_MAPPING.get(os.getenv("SENDER_EMAIL_2")):
    RESUME_MAPPING[os.getenv("SENDER_EMAIL_2")] = str(ASSETS_DIR / "Alan_Truong_Resume.pdf")

COMMON_ATTACHMENTS = [str(ASSETS_DIR / "Certificates.pdf")]

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
