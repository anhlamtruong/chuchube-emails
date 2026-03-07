"""Shared rate limiter instance — importable by routers without circular deps."""
import logging
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

_rl_logger = logging.getLogger("app.rate_limit")


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
            _rl_logger.debug("Rate-limit key: token verification failed, falling back to IP", exc_info=True)
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key, default_limits=["200/minute"])
