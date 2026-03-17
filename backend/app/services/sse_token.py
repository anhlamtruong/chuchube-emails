"""Short-lived SSE tokens.

Generates and verifies opaque HMAC-based tokens scoped to a user.
These replace raw Clerk JWTs in SSE query params — they expire fast
(default 60s) and carry minimal claims.
"""
import hashlib
import hmac
import json
import time

from fastapi import HTTPException

from app import config as _cfg
from app.logging_config import get_logger

logger = get_logger("sse_token")


def create_sse_token(user_id: str, is_admin: bool = False) -> str:
    """Create a short-lived token for SSE endpoints.

    Format: base64(json(payload)).signature
    """
    import base64

    payload = {
        "sub": user_id,
        "adm": is_admin,
        "exp": int(time.time()) + _cfg.SSE_TOKEN_TTL,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode()

    sig = hmac.new(
        _cfg.SSE_TOKEN_SECRET.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()

    return f"{payload_b64}.{sig}"


def verify_sse_token(token: str) -> tuple[str, bool]:
    """Verify an SSE token and return (user_id, is_admin).

    Raises HTTPException(401) on any failure.
    """
    import base64

    try:
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            raise ValueError("bad format")

        payload_b64, sig = parts
        payload_bytes = base64.urlsafe_b64decode(payload_b64)

        expected_sig = hmac.new(
            _cfg.SSE_TOKEN_SECRET.encode(), payload_bytes, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("bad signature")

        payload = json.loads(payload_bytes)
        if payload.get("exp", 0) < time.time():
            raise ValueError("token expired")

        uid = payload.get("sub")
        if not uid:
            raise ValueError("missing sub")

        return uid, payload.get("adm", False)
    except Exception as exc:
        logger.debug("SSE token verification failed: %s", exc)
        raise HTTPException(401, "Invalid or expired SSE token")
