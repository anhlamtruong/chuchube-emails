"""SMTP host allowlist — prevents SSRF by restricting allowed SMTP hosts."""

# Strict allowlist of known, trusted SMTP providers
ALLOWED_SMTP_HOSTS: set[str] = {
    "smtp.gmail.com",
    "smtp.office365.com",
    "smtp.outlook.com",
    "smtp-mail.outlook.com",
    "smtp.mail.yahoo.com",
    "smtp.zoho.com",
    "smtp.fastmail.com",
    "mail.icloud.com",
    "smtp.aol.com",
    "smtp.mailgun.org",
    "smtp.sendgrid.net",
    "smtp.postmarkapp.com",
    "email-smtp.us-east-1.amazonaws.com",
    "email-smtp.us-west-2.amazonaws.com",
    "email-smtp.eu-west-1.amazonaws.com",
    "email-smtp.ap-southeast-1.amazonaws.com",
}


def is_allowed_smtp_host(host: str) -> bool:
    """Check if the SMTP host is in the allowlist."""
    return host.lower().strip() in ALLOWED_SMTP_HOSTS
