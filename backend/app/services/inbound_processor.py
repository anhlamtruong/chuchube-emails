"""Inbound email processor — abstraction layer for reply detection.

Provides a clean seam between email ingestion (IMAP, webhooks) and thread
management logic. The IMAP scanner and future webhook handlers both feed
parsed emails into the same ReplyProcessor.
"""
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Protocol, Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.thread import EmailThread, ThreadMessage
from app.models.email_column import EmailColumn
from app.services.audit_service import log_audit_bg
from app.logging_config import get_logger

logger = get_logger("inbound_processor")

# Strip Re:/Fwd:/Fw: prefixes for subject normalization
_SUBJECT_PREFIX_RE = re.compile(r"^(Re|Fwd|Fw)\s*:\s*", re.IGNORECASE)


@dataclass
class InboundEmail:
    """Parsed inbound email — provider-agnostic representation."""
    message_id: str = ""
    in_reply_to: str = ""
    references: str = ""  # Space-separated list of Message-IDs
    from_email: str = ""
    to_email: str = ""
    subject: str = ""
    body_html: str = ""
    body_text: str = ""
    raw_headers: dict = field(default_factory=dict)
    date: datetime | None = None


@dataclass
class ProcessingResult:
    """Outcome of processing an inbound email."""
    matched: bool = False
    thread_id: str | None = None
    is_new_reply: bool = False
    error: str | None = None


def normalize_subject(subject: str) -> str:
    """Strip Re:/Fwd:/Fw: prefixes and whitespace for comparison."""
    s = subject.strip()
    while True:
        new_s = _SUBJECT_PREFIX_RE.sub("", s).strip()
        if new_s == s:
            break
        s = new_s
    return s


class ThreadCorrelator:
    """Correlate an inbound email to an existing thread."""

    def __init__(self, db: Session):
        self.db = db

    def correlate(self, email: InboundEmail) -> Optional[EmailThread]:
        """Try to find a matching thread using multiple strategies."""
        # Strategy 1: In-Reply-To header (most reliable)
        if email.in_reply_to:
            thread = self._by_in_reply_to(email.in_reply_to)
            if thread:
                return thread

        # Strategy 2: References header chain
        if email.references:
            thread = self._by_references(email.references)
            if thread:
                return thread

        # Strategy 3: Subject-line matching + sender/recipient match
        if email.subject and email.from_email:
            thread = self._by_subject_match(email.subject, email.from_email)
            if thread:
                return thread

        return None

    def _by_in_reply_to(self, in_reply_to: str) -> Optional[EmailThread]:
        """Find thread containing a message with this Message-ID."""
        msg = (
            self.db.query(ThreadMessage)
            .filter(ThreadMessage.message_id == in_reply_to)
            .first()
        )
        if msg:
            return self.db.query(EmailThread).get(msg.thread_id)
        return None

    def _by_references(self, references: str) -> Optional[EmailThread]:
        """Check if any Message-ID in the References header matches a tracked message."""
        ref_ids = references.strip().split()
        if not ref_ids:
            return None
        # Check most recent reference first (end of list) for efficiency
        for ref_id in reversed(ref_ids):
            ref_id = ref_id.strip()
            if not ref_id:
                continue
            msg = (
                self.db.query(ThreadMessage)
                .filter(ThreadMessage.message_id == ref_id)
                .first()
            )
            if msg:
                return self.db.query(EmailThread).get(msg.thread_id)
        return None

    def _by_subject_match(self, subject: str, from_email: str) -> Optional[EmailThread]:
        """Fallback: match by normalized subject + sender email is a known recipient."""
        normalized = normalize_subject(subject)
        if not normalized:
            return None

        # Find threads where the normalized subject matches AND the from_email
        # is the recipient of an outbound message in that thread
        threads = (
            self.db.query(EmailThread)
            .filter(
                EmailThread.subject == normalized,
                EmailThread.status.in_(["awaiting_reply", "sent"]),
            )
            .all()
        )

        for thread in threads:
            # Verify the sender is a known recipient in this thread
            outbound_msg = (
                self.db.query(ThreadMessage)
                .filter(
                    ThreadMessage.thread_id == thread.id,
                    ThreadMessage.direction == "outbound",
                    ThreadMessage.to_email == from_email,
                )
                .first()
            )
            if outbound_msg:
                return thread

        return None


class ReplyProcessor:
    """Process inbound emails and update thread state.

    This is the main entry point — called by both the IMAP scanner and
    future webhook handlers.
    """

    def __init__(self, db: Session, publish_event_fn=None):
        self.db = db
        self.correlator = ThreadCorrelator(db)
        self._publish_event = publish_event_fn

    def process(self, email: InboundEmail) -> ProcessingResult:
        """Process a single inbound email. Returns processing result."""
        result = ProcessingResult()

        # Deduplicate: check if we've already stored this message
        if email.message_id:
            existing = (
                self.db.query(ThreadMessage)
                .filter(ThreadMessage.message_id == email.message_id)
                .first()
            )
            if existing:
                result.matched = True
                result.thread_id = existing.thread_id
                return result

        # Correlate to existing thread
        thread = self.correlator.correlate(email)
        if not thread:
            return result

        result.matched = True
        result.thread_id = thread.id

        # Build the References chain for the new message
        refs = email.references or ""
        if email.in_reply_to and email.in_reply_to not in refs:
            refs = f"{refs} {email.in_reply_to}".strip()

        # Store the inbound message
        msg = ThreadMessage(
            id=str(uuid.uuid4()),
            thread_id=thread.id,
            direction="inbound",
            message_id=email.message_id or None,
            in_reply_to=email.in_reply_to or None,
            references=refs or None,
            from_email=email.from_email,
            to_email=email.to_email,
            subject=email.subject,
            body_html=email.body_html or None,
            body_text=email.body_text or None,
            raw_headers=email.raw_headers or None,
            sent_at=email.date or datetime.now(tz=timezone.utc),
        )
        self.db.add(msg)

        # Update thread state
        thread.status = "replied"
        thread.reply_count = (thread.reply_count or 0) + 1
        thread.last_activity_at = email.date or datetime.now(tz=timezone.utc)
        thread.followup_due_at = None  # Clear follow-up timer on reply

        # Update campaign row sent_status to "response"
        if thread.campaign_row_id:
            campaign_row = self.db.query(EmailColumn).get(thread.campaign_row_id)
            if campaign_row:
                campaign_row.sent_status = "response"

        self.db.commit()
        result.is_new_reply = True

        # Emit SSE event for real-time UI update
        if self._publish_event:
            try:
                self._publish_event("__global__", "thread_reply", {
                    "thread_id": thread.id,
                    "campaign_row_id": thread.campaign_row_id,
                    "from_email": email.from_email,
                    "subject": email.subject,
                    "reply_count": thread.reply_count,
                    "status": "replied",
                })
            except Exception as e:
                logger.warning(f"Failed to publish thread_reply event: {e}")

        # Audit log
        log_audit_bg(
            user_id=thread.user_id,
            event_type="thread.reply_received",
            resource_type="email_thread",
            resource_id=thread.id,
            detail={
                "from_email": email.from_email,
                "subject": email.subject,
                "message_id": email.message_id,
            },
        )

        logger.info(
            f"Reply detected: thread={thread.id}, from={email.from_email}, "
            f"reply_count={thread.reply_count}"
        )

        return result
