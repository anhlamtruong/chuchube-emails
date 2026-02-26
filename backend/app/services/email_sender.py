"""SMTP email sending service — migrated from sending_email/email_sender.py"""
import smtplib
import ssl
import os
import mimetypes
from email.message import EmailMessage


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
    attachment_paths: list[str] | None = None,
    inline_image_path: str | None = None,
) -> bool:
    """Sends a single email using the active server connection."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = recipient_email

    # 1. Inline image (related)
    if inline_image_path and os.path.exists(inline_image_path):
        with open(inline_image_path, "rb") as f:
            img_data = f.read()
        img_subtype = mimetypes.guess_type(inline_image_path)[0].split("/")[1]
        msg.add_related(img_data, maintype="image", subtype=img_subtype, cid="my_dynamic_image")

    # 2. HTML body
    msg.add_alternative(body, subtype="html")

    # 3. Attachments
    # Each item can be a plain path string or a (path, display_name) tuple
    if attachment_paths:
        for item in attachment_paths:
            if isinstance(item, (list, tuple)):
                path, display_name = item[0], item[1]
            else:
                path, display_name = item, os.path.basename(item) if item else None
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
    return True
