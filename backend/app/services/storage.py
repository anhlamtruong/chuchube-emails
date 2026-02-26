"""Supabase Storage service — upload, download, delete files from a private bucket."""
import os
from supabase import create_client, Client
from app.logging_config import get_logger

logger = get_logger("storage")

_client: Client | None = None


def _get_client() -> Client:
    """Lazy-init Supabase client."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(url, key)
    return _client


def get_bucket() -> str:
    return os.getenv("SUPABASE_BUCKET", "documents")


def upload_file(storage_key: str, content: bytes, mime_type: str) -> str:
    """Upload bytes to Supabase Storage. Returns the storage key."""
    client = _get_client()
    bucket = get_bucket()
    client.storage.from_(bucket).upload(
        path=storage_key,
        file=content,
        file_options={"content-type": mime_type},
    )
    logger.info(f"Uploaded {storage_key} to bucket '{bucket}'")
    return storage_key


def download_file(storage_key: str) -> bytes:
    """Download file bytes from Supabase Storage."""
    client = _get_client()
    bucket = get_bucket()
    data = client.storage.from_(bucket).download(storage_key)
    return data


def delete_file(storage_key: str) -> None:
    """Delete a file from Supabase Storage."""
    client = _get_client()
    bucket = get_bucket()
    client.storage.from_(bucket).remove([storage_key])
    logger.info(f"Deleted {storage_key} from bucket '{bucket}'")


def get_signed_url(storage_key: str, expires_in: int = 3600) -> str:
    """Generate a signed URL for private file access."""
    client = _get_client()
    bucket = get_bucket()
    result = client.storage.from_(bucket).create_signed_url(storage_key, expires_in)
    return result["signedURL"]
