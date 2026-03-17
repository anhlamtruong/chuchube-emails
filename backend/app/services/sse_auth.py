"""Shared SSE token verification for EventSource endpoints.

EventSource cannot set headers, so SSE endpoints receive a short-lived
HMAC token as a query parameter.  This replaces the previous approach of
passing raw Clerk JWTs — the new tokens are scoped to SSE, expire in 60s,
and never expose the main auth credential in URLs or server logs.

A fallback to Clerk JWTs is kept during the migration window so existing
clients still work until all frontends are updated.
"""
from fastapi import HTTPException

from app.services.sse_token import verify_sse_token as _verify_sse
from app.logging_config import get_logger

logger = get_logger("sse_auth")


def verify_sse_token(token: str) -> tuple[str, bool]:
    """Verify an SSE query-param token.

    Tries the short-lived HMAC token first; falls back to Clerk JWT
    for backward compatibility.

    Returns:
        (user_id, is_admin) tuple.

    Raises:
        HTTPException(401) if neither method works.
    """
    # 1. Try short-lived SSE token (preferred)
    try:
        return _verify_sse(token)
    except HTTPException:
        pass

    # 2. Fallback — legacy Clerk JWT (remove once all clients use SSE tokens)
    try:
        from app.auth import verify_clerk_token, get_user_id, get_user_role, is_admin_role
        from app.database import SessionLocal

        payload = verify_clerk_token(token)
        uid = get_user_id(payload)
        db = SessionLocal()
        try:
            role = get_user_role(uid, db)
            admin = is_admin_role(role)
        finally:
            db.close()
        logger.debug("SSE auth fell back to Clerk JWT for user %s", uid)
        return uid, admin
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")
