"""Router for user-managed sender email accounts (SMTP + Resend)."""
import smtplib
import ssl
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.auth import require_auth, get_user_id
from app.models.sender_account import SenderAccount
from app.schemas.sender_account import SenderAccountCreate, SenderAccountUpdate, SenderAccountOut
from app.services.vault import store_secret, get_secret, update_secret, delete_secret
from app.services.audit_service import log_audit
from app.smtp_allowlist import is_allowed_smtp_host
from app.logging_config import get_logger

logger = get_logger("sender_accounts")

router = APIRouter(prefix="/api/sender-accounts", tags=["sender-accounts"])


@router.get("/", response_model=list[SenderAccountOut])
def list_sender_accounts(
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """List all sender accounts for the current user."""
    uid = get_user_id(auth)
    accounts = (
        db.query(SenderAccount)
        .filter(SenderAccount.user_id == uid)
        .order_by(SenderAccount.is_default.desc(), SenderAccount.created_at)
        .all()
    )
    return accounts


@router.post("/", response_model=SenderAccountOut, status_code=201)
def create_sender_account(
    data: SenderAccountCreate,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Create a new sender account and store credential in Supabase Vault."""
    uid = get_user_id(auth)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    if data.provider not in ("smtp", "resend"):
        raise HTTPException(400, "provider must be 'smtp' or 'resend'")

    if data.provider == "smtp" and not data.smtp_host:
        raise HTTPException(400, "smtp_host is required for SMTP accounts")

    # SSRF prevention: validate SMTP host against allowlist
    if data.provider == "smtp":
        smtp_host = data.smtp_host or "smtp.gmail.com"
        if not is_allowed_smtp_host(smtp_host):
            raise HTTPException(400, f"SMTP host '{smtp_host}' is not in the allowed list. Contact admin to add it.")

    # If setting as default, clear existing default for this user
    if data.is_default:
        db.query(SenderAccount).filter(
            SenderAccount.user_id == uid, SenderAccount.is_default == True  # noqa: E712
        ).update({"is_default": False})

    # Create the account first (to get the id for vault naming)
    account = SenderAccount(
        user_id=uid,
        email=data.email,
        display_name=data.display_name,
        provider=data.provider,
        smtp_host=data.smtp_host or ("smtp.gmail.com" if data.provider == "smtp" else None),
        smtp_port=data.smtp_port or (465 if data.provider == "smtp" else None),
        vault_secret_name="placeholder",  # will update after insert
        is_default=data.is_default,
        organization_name=data.organization_name,
        organization_type=data.organization_type,
        title=data.title,
        city=data.city,
    )
    db.add(account)
    db.flush()  # get id without committing

    # Store credential in Vault
    secret_name = f"sender_{uid}_{account.id}"
    account.vault_secret_name = secret_name
    store_secret(
        db, secret_name, data.credential,
        description=f"Credential for {data.email} ({data.provider})",
        user_id=uid, ip_address=ip, user_agent=ua,
    )

    # Audit: sender account created
    log_audit(
        db,
        user_id=uid,
        event_type="sender_account.created",
        resource_type="sender_account",
        resource_id=str(account.id),
        detail={"email": data.email, "provider": data.provider},
        ip_address=ip,
        user_agent=ua,
    )

    db.commit()
    db.refresh(account)
    logger.info(f"Created sender account {account.id} for user {uid}")
    return account


@router.put("/{account_id}", response_model=SenderAccountOut)
def update_sender_account(
    account_id: str,
    data: SenderAccountUpdate,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Update a sender account. Optionally update the stored credential."""
    uid = get_user_id(auth)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    account = db.query(SenderAccount).filter(
        SenderAccount.id == account_id, SenderAccount.user_id == uid
    ).first()
    if not account:
        raise HTTPException(404, "Sender account not found")

    # If setting as default, clear existing default
    if data.is_default is True:
        db.query(SenderAccount).filter(
            SenderAccount.user_id == uid,
            SenderAccount.is_default == True,  # noqa: E712
            SenderAccount.id != account_id,
        ).update({"is_default": False})

    # Update fields
    for field in ("email", "display_name", "provider", "smtp_host", "smtp_port", "is_default",
                  "organization_name", "organization_type", "title", "city"):
        val = getattr(data, field, None)
        if val is not None:
            # SSRF prevention on SMTP host update
            if field == "smtp_host" and not is_allowed_smtp_host(str(val)):
                raise HTTPException(400, f"SMTP host '{val}' is not in the allowed list.")
            setattr(account, field, val)

    # Update credential in Vault if provided
    if data.credential:
        update_secret(db, account.vault_secret_name, data.credential, user_id=uid, ip_address=ip, user_agent=ua)

    # Audit: sender account updated
    log_audit(
        db,
        user_id=uid,
        event_type="sender_account.updated",
        resource_type="sender_account",
        resource_id=account_id,
        detail={"email": account.email, "credential_changed": bool(data.credential)},
        ip_address=ip,
        user_agent=ua,
    )

    db.commit()
    db.refresh(account)
    logger.info(f"Updated sender account {account_id}")
    return account


@router.delete("/{account_id}")
def delete_sender_account(
    account_id: str,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Delete a sender account and its Vault secret."""
    uid = get_user_id(auth)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    account = db.query(SenderAccount).filter(
        SenderAccount.id == account_id, SenderAccount.user_id == uid
    ).first()
    if not account:
        raise HTTPException(404, "Sender account not found")

    # Delete from Vault first
    try:
        delete_secret(db, account.vault_secret_name, user_id=uid, ip_address=ip, user_agent=ua)
    except Exception as e:
        logger.warning(f"Could not delete vault secret {account.vault_secret_name}: {e}")

    # Audit: sender account deleted
    log_audit(
        db,
        user_id=uid,
        event_type="sender_account.deleted",
        resource_type="sender_account",
        resource_id=account_id,
        detail={"email": account.email},
        ip_address=ip,
        user_agent=ua,
    )

    db.delete(account)
    db.commit()
    logger.info(f"Deleted sender account {account_id}")
    return {"status": "deleted"}


@router.post("/{account_id}/test")
def test_sender_account(
    account_id: str,
    request: Request,
    auth: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Test an SMTP connection or Resend API key validity."""
    uid = get_user_id(auth)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    account = db.query(SenderAccount).filter(
        SenderAccount.id == account_id, SenderAccount.user_id == uid
    ).first()
    if not account:
        raise HTTPException(404, "Sender account not found")

    credential = get_secret(db, account.vault_secret_name, user_id=uid, ip_address=ip, user_agent=ua)
    if not credential:
        raise HTTPException(400, "No credential found in Vault — try re-saving the account")

    if account.provider == "smtp":
        return _test_smtp(account.email, credential, account.smtp_host or "smtp.gmail.com", account.smtp_port or 465)
    elif account.provider == "resend":
        return _test_resend(credential)
    else:
        raise HTTPException(400, f"Unknown provider: {account.provider}")


@router.post("/test-credential")
def test_credential_before_save(
    data: SenderAccountCreate,
    auth: dict = Depends(require_auth),
):
    """Test a credential before creating the account (no DB save)."""
    if data.provider == "smtp":
        return _test_smtp(
            data.email,
            data.credential,
            data.smtp_host or "smtp.gmail.com",
            data.smtp_port or 465,
        )
    elif data.provider == "resend":
        return _test_resend(data.credential)
    else:
        raise HTTPException(400, f"Unknown provider: {data.provider}")


# --------------------------------------------------------------------------- #
# Internal helpers                                                             #
# --------------------------------------------------------------------------- #

def _test_smtp(email: str, password: str, host: str, port: int) -> dict:
    """Test SMTP connection by logging in and immediately quitting."""
    if not is_allowed_smtp_host(host):
        raise HTTPException(400, f"SMTP host '{host}' is not in the allowed list.")
    try:
        context = ssl.create_default_context()
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=10)
        server.login(email, password)
        server.quit()
        return {"status": "ok", "detail": f"SMTP login successful for {email}"}
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(400, f"Authentication failed for {email}. If using Gmail, use an App Password.")
    except Exception as e:
        import logging
        logging.getLogger("app.sender_accounts").error(f"SMTP connection test failed for {email}@{host}:{port}: {e}")
        raise HTTPException(400, "SMTP connection failed. Check your server settings and try again.")


def _test_resend(api_key: str) -> dict:
    """Test Resend API key by listing domains (uses httpx, no global state)."""
    try:
        import httpx
        resp = httpx.get(
            "https://api.resend.com/domains",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        resp.raise_for_status()
        return {"status": "ok", "detail": "Resend API key is valid"}
    except Exception as e:
        import logging
        logging.getLogger("app.sender_accounts").error(f"Resend API key test failed: {e}")
        raise HTTPException(400, "Resend API key test failed. Verify the key is correct and active.")
