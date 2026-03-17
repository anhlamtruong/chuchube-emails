"""SMTP email sending service — migrated from sending_email/email_sender.py"""
import smtplib
import ssl
import os
import mimetypes
from email.message import EmailMessage
from email.utils import make_msgid


def login_to_server(smtp_server: str, port: int, sender_email: str, password: str):
    """Logs into the SMTP server and returns the server object."""
    context = ssl.create_default_context()
    try:
        server = smtplib.SMTP_SSL(smtp_server, port, context=context)
        server.login(sender_email, password)
        return server
    except smtplib.SMTPAuthenticationError:
        raise RuntimeError(
            f"Authentication error for {sender_email}. "
            "Check your email/password. If using Gmail, use an App Password."
        )
    except Exception as e:
        raise RuntimeError(f"Error connecting to SMTP server: {e}")


def send_email(
    server,
    sender_email: str,
    recipient_email: str,
    subject: str,
    body: str,
    attachment_paths: list | None = None,
    inline_image_path: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> str:
    """Sends a single email using the active server connection.

    Returns the Message-ID of the sent email for thread tracking.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = recipient_email

    # Generate a deterministic Message-ID we can track
    domain = sender_email.split("@")[1] if "@" in sender_email else "localhost"
    msg_id = make_msgid(domain=domain)
    msg["Message-ID"] = msg_id

    # Threading headers for reply chains
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references

    # 1. Inline image (related)
    if inline_image_path and os.path.exists(inline_image_path):
        with open(inline_image_path, "rb") as f:
            img_data = f.read()
        img_subtype = mimetypes.guess_type(inline_image_path)[0].split("/")[1]
        msg.add_related(img_data, maintype="image", subtype=img_subtype, cid="my_dynamic_image")

    # 2. HTML body
    msg.add_alternative(body, subtype="html")

    # 3. Attachments
    # Each item can be:
    #   - a plain path string (legacy, reads from disk)
    #   - a (path, display_name) tuple (legacy, reads from disk)
    #   - a (bytes, display_name, mime_type) tuple (Supabase Storage)
    if attachment_paths:
        for item in attachment_paths:
            if isinstance(item, (list, tuple)) and len(item) == 3 and isinstance(item[0], bytes):
                # Supabase Storage: (bytes, display_name, mime_type)
                file_bytes, display_name, content_type = item
                ctype = content_type or "application/octet-stream"
                maintype, subtype = ctype.split("/", 1)
                msg.add_attachment(
                    file_bytes,
                    maintype=maintype,
                    subtype=subtype,
                    filename=display_name,
                )
            elif isinstance(item, (list, tuple)):
                path, display_name = item[0], item[1]
                if path and os.path.exists(path):
                    ctype, encoding = mimetypes.guess_type(display_name or path)
                    if ctype is None or encoding is not None:
                        ctype = "application/octet-stream"
                    maintype, subtype = ctype.split("/", 1)
                    with open(path, "rb") as f:
                        msg.add_attachment(
                            f.read(),
                            maintype=maintype,
                            subtype=subtype,
                            filename=display_name or os.path.basename(path),
                        )
            else:
                path = item
                display_name = os.path.basename(path) if path else None
                if path and os.path.exists(path):
                    ctype, encoding = mimetypes.guess_type(display_name or path)
                    if ctype is None or encoding is not None:
                        ctype = "application/octet-stream"
                    maintype, subtype = ctype.split("/", 1)
                    with open(path, "rb") as f:
                        msg.add_attachment(
                            f.read(),
                            maintype=maintype,
                            subtype=subtype,
                            filename=display_name or os.path.basename(path),
                        )

    server.send_message(msg)
    return msg_id


def send_email_resend(
    api_key: str,
    from_email: str,
    from_name: str,
    to_email: str,
    subject: str,
    html_body: str,
    attachments: list | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> dict:
    """Send an email via the Resend HTTP API (no global state).

    Uses httpx directly instead of the resend SDK to avoid setting a
    global `resend.api_key` which is not thread-safe.

    `attachments` is a list of (bytes, display_name, mime_type) tuples.
    Returns the Resend API response dict.
    """
    import httpx
    import base64

    from_addr = f"{from_name} <{from_email}>" if from_name else from_email

    payload: dict = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }

    if attachments:
        resend_attachments = []
        for item in attachments:
            if isinstance(item, (list, tuple)) and len(item) == 3 and isinstance(item[0], bytes):
                file_bytes, display_name, _mime = item
                resend_attachments.append({
                    "filename": display_name,
                    "content": base64.b64encode(file_bytes).decode("ascii"),
                })
        if resend_attachments:
            payload["attachments"] = resend_attachments

    # Threading headers
    headers = {}
    if in_reply_to:
        headers["In-Reply-To"] = in_reply_to
    if references:
        headers["References"] = references
    if headers:
        payload["headers"] = headers

    resp = httpx.post(
        "https://api.resend.com/emails",
        json=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def send_access_key_notification(
    recipient_email: str,
    access_key: str,
    role: str,
    assigned_by: str = "System Admin",
) -> bool:
    """Send an access key notification email via SMTP.

    Uses the first default sender account's credentials from the DB.
    Returns True on success, False on failure (logs the error).
    """
    from app.logging_config import get_logger

    logger = get_logger("email_notification")

    # Look up the first default sender account's credentials from DB
    try:
        from app.database import SessionLocal
        from app.models.sender_account import SenderAccount
        from app.services.vault import get_secret

        db = SessionLocal()
        try:
            sender = (
                db.query(SenderAccount)
                .filter(SenderAccount.is_default.is_(True))
                .order_by(SenderAccount.created_at.asc())
                .first()
            )
            if not sender:
                logger.warning("No default sender account found — skipping access key notification")
                return False
            sender_email = sender.email
            sender_password = get_secret(sender.vault_secret_name)
            if not sender_password:
                logger.warning("No password found in vault for sender %s", sender_email)
                return False
            smtp_host = sender.smtp_host or "smtp.gmail.com"
            smtp_port = sender.smtp_port or 465
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to fetch sender account for notification: {e}")
        return False

    subject = "Your Access Key for ChuChube Emails"
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Welcome to ChuChobe Emails!</h2>
        <p>You have been granted <strong>{role}</strong> access.</p>
        <p>Here is your access key:</p>
        <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
            <code style="font-size: 18px; letter-spacing: 2px; color: #1e40af; font-weight: bold;">{access_key}</code>
        </div>
        <p style="color: #dc2626; font-weight: bold;">⚠️ Save this key now — it cannot be retrieved later.</p>
        <p>Enter this key when prompted after signing in with your Clerk account.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #64748b; font-size: 12px;">Assigned by: {assigned_by}</p>
    </body>
    </html>
    """

    try:
        server = login_to_server(smtp_host, smtp_port, sender_email, sender_password)
        send_email(server, sender_email, recipient_email, subject, body)
        server.quit()
        logger.info(f"Access key notification sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send access key notification to {recipient_email}: {e}")
        return False
