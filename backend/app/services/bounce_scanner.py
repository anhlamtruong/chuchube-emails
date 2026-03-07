"""Bounce scanner — IMAP inbox scanning + bounce/OOO classification.

Connects to each SMTP sender account's IMAP inbox, scans for bounce
notifications and out-of-office replies, classifies them (rule-based
first, AI fallback), and updates Recruiter/Referral records.
"""
import imaplib
import email
import re
import uuid
from datetime import datetime, timezone, timedelta
from email.header import decode_header

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.recruiter import Recruiter
from app.models.referral import Referral
from app.models.sender_account import SenderAccount
from app.models.bounce_log import BounceLog
from app.services.vault import get_secret
from app.services.llm_client import llm
from app.services.audit_service import log_audit_bg
from app.logging_config import get_logger

logger = get_logger("bounce_scanner")

# ─── IMAP config ─────────────────────────────────────────────────────── #

# Gmail IMAP — most common; extend map for other providers
IMAP_SERVERS: dict[str, tuple[str, int]] = {
    "smtp.gmail.com": ("imap.gmail.com", 993),
    "smtp-relay.gmail.com": ("imap.gmail.com", 993),
    "smtp.office365.com": ("outlook.office365.com", 993),
    "smtp.mail.yahoo.com": ("imap.mail.yahoo.com", 993),
}

DEFAULT_IMAP = ("imap.gmail.com", 993)


# ─── Rule-based patterns ─────────────────────────────────────────────── #

_BOUNCE_SUBJECT_PATTERNS = [
    re.compile(r"(undeliverable|undelivered|delivery (status )?notification|failure notice|returned mail|mail delivery failed)", re.I),
    re.compile(r"(delivery has failed|could not be delivered|message not delivered)", re.I),
    re.compile(r"(address rejected|user unknown|mailbox (not found|unavailable|full))", re.I),
    re.compile(r"(account (disabled|suspended|inactive|closed)|no such user|relay denied)", re.I),
    re.compile(r"(over quota|recipient rejected|blocked|sender verify failed)", re.I),
    re.compile(r"(permanent failure|message bounced|email address.+not found)", re.I),
]

_BOUNCE_FROM_PATTERNS = [
    re.compile(r"(mailer-daemon|postmaster|mail-daemon|noreply|no-reply)", re.I),
]

_HARD_BOUNCE_CODES = re.compile(r"5\.[1-4]\.\d+|550|551|552|553|554")
_SOFT_BOUNCE_CODES = re.compile(r"4\.\d+\.\d+|450|451|452")

_OOO_PATTERNS = [
    # English — standard auto-reply headers
    re.compile(r"(out of (the )?office|automatic reply|auto[\-\s]?reply|autoreply)", re.I),
    re.compile(r"(i am (currently )?(away|out|unavailable)|i('m| am) not in the office)", re.I),
    re.compile(r"(on (vacation|leave|holiday|pto|sabbatical|maternity|paternity))", re.I),
    re.compile(r"(away from (the )?(office|my desk)|limited email access)", re.I),
    re.compile(r"(will (be )?(back|return)(ing)?\b.{0,40}\b(on|by|after|around))", re.I),
    re.compile(r"(currently (out of|away|unavailable|on leave))", re.I),
    # French
    re.compile(r"(absent du bureau|r[ée]ponse automatique)", re.I),
    # German
    re.compile(r"(abwesenheitsnotiz|automatische antwort)", re.I),
    # Spanish
    re.compile(r"(fuera de la oficina|respuesta autom[aá]tica)", re.I),
    # Portuguese
    re.compile(r"(fora do escrit[oó]rio|resposta autom[aá]tica)", re.I),
]


def _decode_header_value(val: str | None) -> str:
    if not val:
        return ""
    parts = decode_header(val)
    decoded = []
    for data, charset in parts:
        if isinstance(data, bytes):
            decoded.append(data.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(data)
    return " ".join(decoded)


def _get_body_text(msg: email.message.Message) -> str:
    """Extract plain-text body from an email message, truncated to 2000 chars."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="replace")[:2000]
        # Fallback: try HTML
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    text = payload.decode("utf-8", errors="replace")
                    # Strip HTML tags for classification
                    text = re.sub(r"<[^>]+>", " ", text)
                    return text[:2000]
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", errors="replace")[:2000]
    return ""


def _extract_bounced_email(body: str, subject: str) -> str | None:
    """Try to find the original recipient email from bounce body/subject."""
    # Common patterns in bounce messages
    patterns = [
        re.compile(r"(?:to|recipient|address|mailbox)[:\s]+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?", re.I),
        re.compile(r"<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>.*(?:failed|rejected|bounced|undeliverable)", re.I),
        re.compile(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}).*(?:does not exist|user unknown|mailbox not found|no such user)", re.I),
    ]
    for pattern in patterns:
        m = pattern.search(body)
        if m:
            return m.group(1).lower()
        m = pattern.search(subject)
        if m:
            return m.group(1).lower()
    # Fallback: find any email in the body that's not common system addresses
    all_emails = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", body)
    skip = {"mailer-daemon", "postmaster", "noreply", "no-reply"}
    for e in all_emails:
        local = e.split("@")[0].lower()
        if local not in skip:
            return e.lower()
    return None


def _extract_ooo_sender(msg: email.message.Message) -> str | None:
    """Get the From address of an OOO reply (the person who is away)."""
    from_header = _decode_header_value(msg.get("From", ""))
    emails = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", from_header)
    return emails[0].lower() if emails else None


# ─── Classification ──────────────────────────────────────────────────── #

def classify_email(subject: str, body: str, from_addr: str) -> tuple[str, str, str | None]:
    """Classify an email into (bounce_type, classification_method, error_code).

    Returns one of: ("hard", "rule"/"ai", code), ("soft", ..., code),
                    ("ooo", "rule"/"ai", None), ("normal", "rule", None)
    """
    # --- Rule-based: OOO ---
    for pat in _OOO_PATTERNS:
        if pat.search(subject) or pat.search(body[:500]):
            return ("ooo", "rule", None)

    # --- Rule-based: bounce from system sender ---
    is_system_sender = any(pat.search(from_addr) for pat in _BOUNCE_FROM_PATTERNS)
    is_bounce_subject = any(pat.search(subject) for pat in _BOUNCE_SUBJECT_PATTERNS)

    if is_system_sender or is_bounce_subject:
        # Try to determine hard vs soft from error codes
        codes = _HARD_BOUNCE_CODES.findall(body)
        if codes:
            return ("hard", "rule", codes[0])
        codes = _SOFT_BOUNCE_CODES.findall(body)
        if codes:
            return ("soft", "rule", codes[0])
        # Bounce but can't determine type — default to hard
        return ("hard", "rule", None)

    # --- AI fallback (only if Ollama is available AND healthy) ---
    if llm.is_available() and llm.is_healthy:
        try:
            result = llm.classify(
                text=f"Subject: {subject}\n\n{body[:1500]}",
                categories=["hard_bounce", "soft_bounce", "ooo", "normal"],
                system_prompt=(
                    "You are an email classification system. Classify emails as:\n"
                    "- hard_bounce: permanent delivery failure (user not found, domain invalid)\n"
                    "- soft_bounce: temporary delivery failure (mailbox full, server busy)\n"
                    "- ooo: out-of-office / vacation auto-reply\n"
                    "- normal: regular email, not a bounce or auto-reply"
                ),
            )
            if result in ("hard_bounce", "soft_bounce"):
                bounce_type = result.replace("_bounce", "")
                return (bounce_type, "ai", None)
            elif result == "ooo":
                return ("ooo", "ai", None)
        except Exception as e:
            logger.warning(f"AI classification failed: {e}")

    return ("normal", "rule", None)


def _parse_return_date(text: str):
    """Try to extract a return date from OOO body text. Returns date or None."""
    from datetime import date as _date
    import re as _re

    # Common patterns: "back on July 15", "return on 2025-07-15", "February 28" etc.
    # Try LLM extraction first
    if llm.is_available():
        try:
            result = llm.extract(
                text=text[:1500],
                instruction=(
                    "Extract the return date from this out-of-office email. "
                    "Return ONLY the date in YYYY-MM-DD format. "
                    "If no return date is mentioned, reply with just 'NONE'."
                ),
            )
            if result and result.strip().upper() != "NONE":
                cleaned = _re.search(r"\d{4}-\d{2}-\d{2}", result.strip())
                if cleaned:
                    parsed = _date.fromisoformat(cleaned.group())
                    # Only trust LLM date if it's today or in the future
                    if parsed >= _date.today():
                        return parsed
        except Exception:
            pass

    # Fallback: regex for common date patterns
    # YYYY-MM-DD
    m = _re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        try:
            return _date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # Month DD, YYYY or Month DD
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5,
        "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
        "november": 11, "december": 12,
    }
    m = _re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b",
        text,
        _re.IGNORECASE,
    )
    if m:
        try:
            month_num = months[m.group(1).lower()]
            day = int(m.group(2))
            year = int(m.group(3)) if m.group(3) else datetime.now().year
            d = _date(year, month_num, day)
            # If no year was given and the date is in the past, assume next year
            if not m.group(3) and d < _date.today():
                d = _date(year + 1, month_num, day)
            return d
        except (ValueError, KeyError):
            pass

    # DD/MM/YYYY or MM/DD/YYYY — assume MM/DD/YYYY for US
    m = _re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", text)
    if m:
        try:
            return _date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            pass

    return None


def extract_ooo_message(body: str) -> str:
    """Extract a short OOO / vacation summary from the email body."""
    if llm.is_available():
        try:
            summary = llm.extract(
                text=body[:2000],
                instruction=(
                    "Extract a brief out-of-office/vacation summary from this email. "
                    "Include return date if mentioned. Keep it under 100 words. "
                    "If no clear OOO message, reply with just 'OOO reply received'."
                ),
            )
            if summary:
                return summary[:300]
        except Exception:
            pass
    # Fallback: first 150 chars
    clean = re.sub(r"\s+", " ", body).strip()
    return clean[:150] if clean else "OOO reply received"


# ─── IMAP scan for a single sender account ───────────────────────────── #

def scan_account(account: SenderAccount, db: Session, *,
                  since_days: int = 3, max_messages: int = 200,
                  email_callback=None) -> dict:
    """Scan one sender account's IMAP inbox for bounces/OOOs.

    Returns summary dict: {checked: int, bounces: int, ooo: int, errors: [str]}
    """
    stats = {"checked": 0, "bounces": 0, "ooo": 0, "errors": []}

    # Determine IMAP server from SMTP host
    smtp_host = (account.smtp_host or "smtp.gmail.com").lower()
    imap_host, imap_port = IMAP_SERVERS.get(smtp_host, DEFAULT_IMAP)

    # Get credential from vault
    credential = get_secret(db, account.vault_secret_name)
    if not credential:
        stats["errors"].append(f"No credential for {account.email}")
        return stats

    # Connect via IMAP SSL
    try:
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(account.email, credential)
    except Exception as e:
        stats["errors"].append(f"IMAP login failed for {account.email}: {e}")
        return stats

    try:
        mail.select("INBOX", readonly=True)

        # Search for recent messages from system senders or with bounce subjects
        since_date = (datetime.now(tz=timezone.utc) - timedelta(days=since_days)).strftime("%d-%b-%Y")
        # Search for ALL recent — we'll classify in Python
        status, data = mail.search(None, f'(SINCE "{since_date}")')
        if status != "OK":
            stats["errors"].append(f"IMAP search failed for {account.email}")
            return stats

        msg_ids = data[0].split() if data[0] else []
        # Limit to configured max messages to avoid overload
        msg_ids = msg_ids[-max_messages:]

        for msg_id in msg_ids:
            try:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != "OK":
                    continue

                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                subject = _decode_header_value(msg.get("Subject", ""))
                from_addr = _decode_header_value(msg.get("From", ""))
                body = _get_body_text(msg)

                # Classify
                bounce_type, classification, error_code = classify_email(subject, body, from_addr)
                stats["checked"] += 1

                # Notify per-email callback for live feed
                if email_callback:
                    try:
                        email_callback({
                            "subject": (subject[:120] if subject else ""),
                            "from_addr": (from_addr[:120] if from_addr else ""),
                            "classification": bounce_type,
                            "method": classification,
                            "account": account.email,
                        })
                    except Exception:
                        pass

                if bounce_type == "normal":
                    continue

                # Determine the affected recipient email
                if bounce_type == "ooo":
                    affected_email = _extract_ooo_sender(msg)
                else:
                    affected_email = _extract_bounced_email(body, subject)

                if not affected_email:
                    continue

                # Check if we already logged this exact bounce
                existing = db.query(BounceLog).filter(
                    BounceLog.sender_email == account.email,
                    BounceLog.recipient_email == affected_email,
                    BounceLog.bounce_type == bounce_type,
                    BounceLog.raw_subject == subject[:500],
                ).first()
                if existing:
                    continue

                # Process based on type
                action = "none"
                if bounce_type in ("hard", "soft"):
                    action = _handle_bounce(db, affected_email, bounce_type)
                    stats["bounces"] += 1
                elif bounce_type == "ooo":
                    action = _handle_ooo(db, affected_email, body)
                    stats["ooo"] += 1

                # Log the event
                bl = BounceLog(
                    id=str(uuid.uuid4()),
                    sender_email=account.email,
                    recipient_email=affected_email,
                    bounce_type=bounce_type,
                    classification=classification,
                    raw_subject=subject[:500],
                    raw_snippet=body[:500],
                    error_code=error_code,
                    detail={"from": from_addr[:200]},
                    action_taken=action,
                )
                db.add(bl)
                db.commit()

                # Audit log
                log_audit_bg(
                    user_id=account.user_id,
                    event_type=f"bounce.{bounce_type}",
                    resource_type="bounce_log",
                    resource_id=bl.id,
                    detail={
                        "sender": account.email,
                        "recipient": affected_email,
                        "error_code": error_code,
                        "classification": classification,
                        "action": action,
                    },
                )

            except Exception as e:
                logger.warning(f"Error processing message in {account.email}: {e}")
                stats["errors"].append(str(e))

    finally:
        try:
            mail.close()
            mail.logout()
        except Exception:
            pass

    return stats


def _handle_bounce(db: Session, recipient_email: str, bounce_type: str) -> str:
    """Mark a Recruiter/Referral as bounced. Returns action taken."""
    new_status = "bounced" if bounce_type == "hard" else "risky"

    # Status priority: bounced > ooo > risky > valid
    # Hard bounce can overwrite anything except bounced.
    # Soft bounce (risky) must not overwrite bounced or ooo.
    excluded = {"bounced"}
    if new_status == "risky":
        excluded.add("ooo")

    # Update recruiter
    recruiter = db.query(Recruiter).filter(
        Recruiter.email == recipient_email,
        Recruiter.email_status.notin_(excluded),
    ).first()
    if recruiter:
        recruiter.email_status = new_status
        logger.info(f"Marked recruiter {recipient_email} as {new_status}")

    # Update referral
    referral = db.query(Referral).filter(
        Referral.email == recipient_email,
        Referral.email_status.notin_(excluded),
    ).first()
    if referral:
        referral.email_status = new_status
        logger.info(f"Marked referral {recipient_email} as {new_status}")

    db.commit()
    return f"marked_{new_status}"


def _handle_ooo(db: Session, sender_email: str, body: str) -> str:
    """Prepend OOO note to Recruiter/Referral notes + set return date + email_status. Returns action taken."""
    ooo_msg = extract_ooo_message(body)
    return_date = _parse_return_date(body)
    # If no explicit return date found, default to 14 days from now
    if return_date is None:
        return_date = (datetime.now(tz=timezone.utc) + timedelta(days=14)).date()
    date_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    prefix = f"[OOO {date_str}] {ooo_msg}\n"

    updated = False

    recruiter = db.query(Recruiter).filter(Recruiter.email == sender_email).first()
    if recruiter:
        # Strip any existing OOO prefix before prepending new one
        recruiter.notes = re.sub(
            r"^\[OOO\s+\d{4}-\d{2}-\d{2}\]\s*[^\n]*\n?",
            "", recruiter.notes or "",
        )
        recruiter.notes = prefix + (recruiter.notes or "")
        recruiter.ooo_return_date = return_date
        # Set email_status to ooo (don't overwrite bounced)
        if recruiter.email_status not in ("bounced",):
            recruiter.email_status = "ooo"
        updated = True

    referral = db.query(Referral).filter(Referral.email == sender_email).first()
    if referral:
        # Strip any existing OOO prefix before prepending new one
        referral.notes = re.sub(
            r"^\[OOO\s+\d{4}-\d{2}-\d{2}\]\s*[^\n]*\n?",
            "", referral.notes or "",
        )
        referral.notes = prefix + (referral.notes or "")
        referral.ooo_return_date = return_date
        # Set email_status to ooo (don't overwrite bounced)
        if referral.email_status not in ("bounced",):
            referral.email_status = "ooo"
        updated = True

    if updated:
        db.commit()
        logger.info(f"Prepended OOO note for {sender_email}" +
                     (f" (return: {return_date})" if return_date else ""))
        return "ooo_noted"

    return "none"


# ─── Run full scan across all sender accounts ────────────────────────── #

def run_full_scan(*, progress_callback=None, email_callback=None,
                   since_days: int = 3, max_messages: int = 200) -> dict:
    """Scan ALL SMTP sender accounts for bounces. Called by background loop.

    Args:
        progress_callback: Optional callable(account_idx, total, email, stats_so_far)
            invoked after each account finishes so the caller can track progress.
        email_callback: Optional callable(event_dict) invoked after each email
            is classified so the caller can stream live results.
        since_days: How many days back to search IMAP SINCE (default 3).
        max_messages: Maximum emails to scan per account (default 200).
    """
    # Reset AI failure counter so each scan cycle gets a fresh chance
    llm.reset_failures()

    db = SessionLocal()
    try:
        # Only scan SMTP accounts (not resend — no IMAP for API senders)
        accounts = (
            db.query(SenderAccount)
            .filter(SenderAccount.provider == "smtp")
            .all()
        )

        total_stats = {"accounts": 0, "checked": 0, "bounces": 0, "ooo": 0, "errors": []}

        # Notify caller how many accounts we'll scan
        if progress_callback:
            progress_callback(0, len(accounts), "", total_stats)

        for idx, account in enumerate(accounts):
            logger.info(f"Scanning inbox: {account.email}")
            # Notify caller which account is being scanned
            if progress_callback:
                progress_callback(idx, len(accounts), account.email, total_stats)
            try:
                stats = scan_account(
                    account, db,
                    since_days=since_days,
                    max_messages=max_messages,
                    email_callback=email_callback,
                )
                total_stats["accounts"] += 1
                total_stats["checked"] += stats["checked"]
                total_stats["bounces"] += stats["bounces"]
                total_stats["ooo"] += stats["ooo"]
                total_stats["errors"].extend(stats["errors"])

                # Update last check timestamp
                account.last_bounce_check_at = datetime.now(tz=timezone.utc)
                db.commit()
            except Exception as e:
                logger.error(f"Failed to scan {account.email}: {e}")
                total_stats["errors"].append(f"{account.email}: {e}")

            # Notify caller this account is done
            if progress_callback:
                progress_callback(idx + 1, len(accounts), account.email, total_stats)

        logger.info(
            f"Bounce scan complete: {total_stats['accounts']} accounts, "
            f"{total_stats['bounces']} bounces, {total_stats['ooo']} OOO"
        )

        # Audit: scan completed
        log_audit_bg(
            user_id="system",
            event_type="bounce_check.completed",
            resource_type="system",
            detail=total_stats,
        )

        return total_stats

    finally:
        db.close()
