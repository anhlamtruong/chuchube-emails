"""Clerk JWT authentication — verifies tokens using Clerk's JWKS endpoint."""
import hmac
import time
import threading
from datetime import datetime, timezone
import jwt
import requests
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import CLERK_JWKS_URL, SESSION_TIMEOUT_SECONDS, ACCESS_KEY_ENABLED, ACCESS_MASTER_KEY
from app.logging_config import get_logger

logger = get_logger("auth")

security = HTTPBearer(auto_error=False)

# JWKS cache with TTL (refreshes every 5 minutes) — thread-safe
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0
_JWKS_TTL = 300  # seconds
_jwks_lock = threading.Lock()

# ─── Role cache (avoids DB query on every request) ────────────────────── #
_role_cache: dict[str, tuple[str, float]] = {}  # user_id -> (role, fetched_at)
_ROLE_TTL = 60  # seconds


def _get_jwks(force_refresh: bool = False) -> dict:
    """Fetch Clerk's JWKS with a 5-minute TTL cache (thread-safe).

    Retries once with a 1-second backoff on network/HTTP errors,
    falling back to the stale cache if available.
    """
    global _jwks_cache, _jwks_fetched_at
    now = time.monotonic()
    # Fast path — no lock needed if cache is fresh
    if not force_refresh and _jwks_cache is not None and (now - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache
    with _jwks_lock:
        # Double-check inside lock
        now = time.monotonic()
        if not force_refresh and _jwks_cache is not None and (now - _jwks_fetched_at) < _JWKS_TTL:
            return _jwks_cache
        last_err = None
        for attempt in range(2):
            try:
                resp = requests.get(CLERK_JWKS_URL, timeout=10)
                resp.raise_for_status()
                _jwks_cache = resp.json()
                _jwks_fetched_at = time.monotonic()
                return _jwks_cache
            except (requests.RequestException, ValueError) as e:
                last_err = e
                logger.warning(f"JWKS fetch attempt {attempt + 1} failed: {e}")
                if attempt == 0:
                    time.sleep(1)  # brief backoff before retry
        # All retries failed — use stale cache if available
        if _jwks_cache is not None:
            logger.warning("JWKS fetch failed, using stale cache")
            return _jwks_cache
        raise RuntimeError(f"Unable to fetch JWKS from {CLERK_JWKS_URL}: {last_err}")


def _get_signing_key(token: str) -> jwt.algorithms.RSAAlgorithm:
    """Extract the correct public key from JWKS for the given JWT."""
    jwks = _get_jwks()
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    for key_data in jwks.get("keys", []):
        if key_data["kid"] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    # If kid not found, force-refresh JWKS and retry once
    jwks = _get_jwks(force_refresh=True)
    for key_data in jwks.get("keys", []):
        if key_data["kid"] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    raise ValueError(f"No matching key found for kid={kid}")


def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk-issued JWT and return the decoded payload."""
    try:
        public_key = _get_signing_key(token)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk tokens don't always include aud
        )
        # Session timeout: reject tokens issued more than SESSION_TIMEOUT_SECONDS ago
        iat = payload.get("iat")
        if iat and (time.time() - iat) > SESSION_TIMEOUT_SECONDS:
            raise HTTPException(401, "Session expired — please sign in again")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token has expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid Clerk token: {e}")
        raise HTTPException(401, f"Invalid token: {e}")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(401, "Authentication failed")


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """FastAPI dependency — enforces Clerk JWT authentication.

    Returns the decoded JWT payload (contains sub, email, etc.).
    """
    if not credentials:
        raise HTTPException(401, "Missing authorization header")
    return verify_clerk_token(credentials.credentials)


def get_user_id(auth: dict) -> str:
    """Extract user_id (Clerk sub claim) from the decoded JWT payload."""
    user_id = auth.get("sub")
    if not user_id:
        raise HTTPException(401, "Missing user identifier in token")
    return user_id


# ─── Role helpers ──────────────────────────────────────────────────────── #

def get_user_role(user_id: str, db: Session) -> str:
    """Return the role string for a user (cached 60s). Default: 'user'."""
    now = time.monotonic()
    cached = _role_cache.get(user_id)
    if cached and (now - cached[1]) < _ROLE_TTL:
        return cached[0]

    from app.models.user_role import UserRole
    row = db.query(UserRole).filter(UserRole.user_id == user_id).first()
    role = row.role if row else "user"
    _role_cache[user_id] = (role, now)
    return role


def invalidate_role_cache(user_id: str) -> None:
    """Remove a user from the role cache (call after role changes)."""
    _role_cache.pop(user_id, None)


def is_admin_role(role: str) -> bool:
    """Return True if the role grants admin-level access."""
    return role in ("master_admin", "admin")


def validate_access_key(request: Request, user_id: str, db: Session) -> None:
    """Validate the X-Access-Key header against the access_keys table.

    Keys are stored as bcrypt hashes. Lookup uses the 8-char prefix for
    efficiency, then verifies via bcrypt.checkpw.

    - Master admin (role=master_admin) is always exempt.
    - If ACCESS_KEY_ENABLED is False, skip entirely.
    - On first use, the key is bound to the user_id.
    - Subsequent calls from the same user pass; different user → 403.
    """
    if not ACCESS_KEY_ENABLED:
        return

    # Master admin is always exempt (DB-backed role check)
    role = get_user_role(user_id, db)
    if role == "master_admin":
        return

    key_value = request.headers.get("x-access-key")
    if not key_value:
        raise HTTPException(403, "Access key required. Please enter your access key to use this application.")

    # Master key bypasses all DB checks (timing-safe comparison)
    if ACCESS_MASTER_KEY and hmac.compare_digest(key_value, ACCESS_MASTER_KEY):
        return

    import bcrypt
    from app.models.access_key import AccessKey

    prefix = key_value[:8]
    candidates = (
        db.query(AccessKey)
        .filter(AccessKey.key_prefix == prefix, AccessKey.is_active == True)  # noqa: E712
        .all()
    )

    # Bcrypt lookup by prefix — plaintext fallback removed (migration 024)
    ak = None
    for c in candidates:
        if c.key_hash and bcrypt.checkpw(key_value.encode(), c.key_hash.encode()):
            ak = c
            break

    if not ak:
        raise HTTPException(403, "Invalid or revoked access key")

    if ak.used_by_user_id is None:
        # First use — bind to this user
        ak.used_by_user_id = user_id
        ak.used_at = datetime.now(tz=timezone.utc)
        db.commit()
    elif ak.used_by_user_id != user_id:
        raise HTTPException(403, "This access key is already in use by another account")
