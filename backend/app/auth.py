"""Clerk JWT authentication — verifies tokens using Clerk's JWKS endpoint."""
import jwt
import requests
from functools import lru_cache
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import CLERK_JWKS_URL
from app.logging_config import get_logger

logger = get_logger("auth")

security = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """Fetch Clerk's JWKS (cached in-process for the lifetime of the app)."""
    resp = requests.get(CLERK_JWKS_URL, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _get_signing_key(token: str) -> jwt.algorithms.RSAAlgorithm:
    """Extract the correct public key from JWKS for the given JWT."""
    jwks = _get_jwks()
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    for key_data in jwks.get("keys", []):
        if key_data["kid"] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    # If kid not found, clear cache and retry once
    _get_jwks.cache_clear()
    jwks = _get_jwks()
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
