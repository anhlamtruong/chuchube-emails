"""Document upload/management router — files stored in Supabase Storage."""
import os
import uuid
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.document import Document
from app.schemas.document import DocumentOut
from app.services.storage import upload_file as sb_upload, download_file as sb_download, delete_file as sb_delete
from app.logging_config import get_logger

logger = get_logger("documents")

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Allowed file extensions for upload
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".txt",
                      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
                      ".zip", ".pptx", ".ppt"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def _validate_upload(file: UploadFile, content: bytes) -> str:
    """Validate file type and size. Returns the extension."""
    ext = os.path.splitext(file.filename or "file")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large ({len(content) / 1024 / 1024:.1f} MB). Max: {MAX_FILE_SIZE / 1024 / 1024:.0f} MB")
    return ext


def _storage_key(user_id: str, filename: str) -> str:
    """Build a Supabase Storage key: {user_id}/{filename}."""
    return f"{user_id}/{filename}"


@router.get("/", response_model=list[DocumentOut])
def list_documents(
    scope: str | None = Query(None),
    scope_ref: str | None = Query(None),
    db: Session = Depends(get_db),
    auth: dict = Depends(require_auth),
):
    """List documents, optionally filtered by scope and scope_ref."""
    uid = get_user_id(auth)
    q = db.query(Document).filter(Document.user_id == uid)
    if scope:
        q = q.filter(Document.scope == scope)
    if scope_ref:
        q = q.filter(Document.scope_ref == scope_ref)
    return q.order_by(Document.created_at.desc()).all()


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    scope: str = Form("global"),
    scope_ref: str = Form(""),
    db: Session = Depends(get_db),
    auth: dict = Depends(require_auth),
):
    """Upload a document to Supabase Storage."""
    uid = get_user_id(auth)
    if scope not in ("global", "sender", "campaign_row"):
        raise HTTPException(400, "scope must be global, sender, or campaign_row")

    content = await file.read()
    ext = _validate_upload(file, content)
    size = len(content)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    mime = file.content_type or mimetypes.guess_type(file.filename or "file")[0] or "application/octet-stream"
    storage_key = _storage_key(uid, stored_name)

    try:
        sb_upload(storage_key, content, mime)
    except Exception as e:
        logger.error(f"Supabase upload failed: {e}")
        raise HTTPException(500, "File upload failed")

    doc = Document(
        filename=stored_name,
        original_name=file.filename or "file",
        file_path=storage_key,
        mime_type=mime,
        size_bytes=size,
        scope=scope,
        scope_ref=scope_ref if scope_ref else None,
        user_id=uid,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/upload-multiple", response_model=list[DocumentOut], status_code=201)
async def upload_multiple_documents(
    files: list[UploadFile] = File(...),
    scope: str = Form("global"),
    scope_ref: str = Form(""),
    db: Session = Depends(get_db),
    auth: dict = Depends(require_auth),
):
    """Upload multiple documents to Supabase Storage."""
    uid = get_user_id(auth)
    if scope not in ("global", "sender", "campaign_row"):
        raise HTTPException(400, "scope must be global, sender, or campaign_row")

    results = []
    for upload_file in files:
        content = await upload_file.read()
        ext = _validate_upload(upload_file, content)
        size = len(content)
        stored_name = f"{uuid.uuid4().hex}{ext}"
        mime = upload_file.content_type or mimetypes.guess_type(upload_file.filename or "file")[0] or "application/octet-stream"
        storage_key = _storage_key(uid, stored_name)

        try:
            sb_upload(storage_key, content, mime)
        except Exception as e:
            logger.error(f"Supabase upload failed for {upload_file.filename}: {e}")
            raise HTTPException(500, f"Upload failed for {upload_file.filename}")

        doc = Document(
            filename=stored_name,
            original_name=upload_file.filename or "file",
            file_path=storage_key,
            mime_type=mime,
            size_bytes=size,
            scope=scope,
            scope_ref=scope_ref if scope_ref else None,
            user_id=uid,
        )
        db.add(doc)
        results.append(doc)

    db.commit()
    for doc in results:
        db.refresh(doc)
    return results


@router.get("/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db), auth: dict = Depends(require_auth)):
    """Download a document from Supabase Storage."""
    uid = get_user_id(auth)
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.user_id is not None and doc.user_id != uid:
        raise HTTPException(403, "Not authorized to access this document")
    try:
        data = sb_download(doc.file_path)
    except Exception as e:
        logger.error(f"Supabase download failed for {doc.file_path}: {e}")
        raise HTTPException(404, "File not found in storage")
    return Response(
        content=data,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.original_name}"'},
    )


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db), auth: dict = Depends(require_auth)):
    """Delete a document from Supabase Storage and DB."""
    uid = get_user_id(auth)
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.user_id is not None and doc.user_id != uid:
        raise HTTPException(403, "Not authorized to delete this document")
    try:
        sb_delete(doc.file_path)
    except Exception as e:
        logger.warning(f"Supabase delete failed for {doc.file_path}: {e}")
    db.delete(doc)
    db.commit()
    return {"ok": True}
