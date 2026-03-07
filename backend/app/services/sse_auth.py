"""Shared SSE token verification for EventSource endpoints.

EventSource cannot set headers, so SSE endpoints receive the Clerk JWT
as a query parameter.  This module provides a single `verify_sse_token`
function to avoid duplicating the logic in every SSE router.
"""
from fastapi import HTTPException

from app.auth import verify_clerk_token, get_user_id, get_user_role, is_admin_role
from app.database import SessionLocal


def verify_sse_token(token: str) -> tuple[str, bool]:
    """Verify a Clerk JWT passed as a query param.

    Returns:
        (user_id, is_admin) tuple.

    Raises:
        HTTPException(401) if the token is invalid.
    """
    try:
        payload = verify_clerk_token(token)
        uid = get_user_id(payload)
        db = SessionLocal()
        try:
            role = get_user_role(uid, db)
            admin = is_admin_role(role)
        finally:
            db.close()
        return uid, admin
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")
