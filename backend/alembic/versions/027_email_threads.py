"""Add email_threads and thread_messages tables for conversation tracking.

Also adds thread_id and message_id columns to email_columns.

Revision ID: 027_email_threads
Revises: 026_add_parent_job_id
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "027_email_threads"
down_revision = "026_add_parent_job_id"
branch_labels = None
depends_on = None


def upgrade():
    # --- email_threads table ---
    op.create_table(
        "email_threads",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(200), nullable=False),
        sa.Column("campaign_row_id", UUID(as_uuid=False), sa.ForeignKey("email_columns.id", ondelete="CASCADE"), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("status", sa.String(30), nullable=False, server_default="sent"),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_sent_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("followup_due_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_email_threads_user_id", "email_threads", ["user_id"])
    op.create_index("ix_email_threads_campaign_row_id", "email_threads", ["campaign_row_id"])
    op.create_index("ix_email_threads_status", "email_threads", ["status"])
    op.create_index("ix_email_threads_followup_due_at", "email_threads", ["followup_due_at"])
    op.create_index("ix_email_threads_user_status", "email_threads", ["user_id", "status"])
    op.create_index("ix_email_threads_user_followup", "email_threads", ["user_id", "followup_due_at"])

    # --- thread_messages table ---
    op.create_table(
        "thread_messages",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("thread_id", UUID(as_uuid=False), sa.ForeignKey("email_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("message_id", sa.String(500), nullable=True, unique=True),
        sa.Column("in_reply_to", sa.String(500), nullable=True),
        sa.Column("references", sa.Text(), nullable=True),
        sa.Column("from_email", sa.String(320), nullable=False),
        sa.Column("to_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("raw_headers", JSONB(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_thread_messages_thread_id", "thread_messages", ["thread_id"])
    op.create_index("ix_thread_messages_message_id", "thread_messages", ["message_id"])
    op.create_index("ix_thread_messages_in_reply_to", "thread_messages", ["in_reply_to"])

    # --- Add thread_id and message_id to email_columns ---
    op.add_column(
        "email_columns",
        sa.Column("thread_id", UUID(as_uuid=False), sa.ForeignKey("email_threads.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_email_columns_thread_id", "email_columns", ["thread_id"])

    op.add_column(
        "email_columns",
        sa.Column("message_id", sa.String(500), nullable=True),
    )

    # --- Enable RLS (defense-in-depth) ---
    op.execute("ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY")


def downgrade():
    # Remove columns from email_columns
    op.drop_index("ix_email_columns_thread_id", table_name="email_columns")
    op.drop_column("email_columns", "thread_id")
    op.drop_column("email_columns", "message_id")

    # Drop thread_messages
    op.drop_index("ix_thread_messages_in_reply_to", table_name="thread_messages")
    op.drop_index("ix_thread_messages_message_id", table_name="thread_messages")
    op.drop_index("ix_thread_messages_thread_id", table_name="thread_messages")
    op.drop_table("thread_messages")

    # Drop email_threads
    op.drop_index("ix_email_threads_user_followup", table_name="email_threads")
    op.drop_index("ix_email_threads_user_status", table_name="email_threads")
    op.drop_index("ix_email_threads_followup_due_at", table_name="email_threads")
    op.drop_index("ix_email_threads_status", table_name="email_threads")
    op.drop_index("ix_email_threads_campaign_row_id", table_name="email_threads")
    op.drop_index("ix_email_threads_user_id", table_name="email_threads")
    op.drop_table("email_threads")
