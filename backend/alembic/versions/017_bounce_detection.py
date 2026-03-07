"""Add bounce detection columns + bounce_logs table.

Revision ID: 017_bounce_detection
Revises: 016_add_access_keys
Create Date: 2025-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "017_bounce_detection"
down_revision = "016_add_access_keys"
branch_labels = None
depends_on = None


def upgrade():
    # --- email_status on recruiters ---
    op.add_column("recruiters", sa.Column("email_status", sa.String(20), nullable=False, server_default="valid"))
    op.create_index("ix_recruiters_email_status", "recruiters", ["email_status"])

    # --- email_status on referrals ---
    op.add_column("referrals", sa.Column("email_status", sa.String(20), nullable=False, server_default="valid"))
    op.create_index("ix_referrals_email_status", "referrals", ["email_status"])

    # --- last_bounce_check_at on sender_accounts ---
    op.add_column("sender_accounts", sa.Column("last_bounce_check_at", sa.DateTime(), nullable=True))

    # --- bounce_logs table ---
    op.create_table(
        "bounce_logs",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("sender_email", sa.String(320), nullable=False, index=True),
        sa.Column("recipient_email", sa.String(320), nullable=False, index=True),
        sa.Column("bounce_type", sa.String(30), nullable=False),
        sa.Column("classification", sa.String(30), nullable=False, server_default="rule"),
        sa.Column("raw_subject", sa.Text(), nullable=False, server_default=""),
        sa.Column("raw_snippet", sa.Text(), nullable=False, server_default=""),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column("detail", JSONB, nullable=True),
        sa.Column("action_taken", sa.String(50), nullable=False, server_default="none"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("bounce_logs")
    op.drop_column("sender_accounts", "last_bounce_check_at")
    op.drop_index("ix_referrals_email_status", table_name="referrals")
    op.drop_column("referrals", "email_status")
    op.drop_index("ix_recruiters_email_status", table_name="recruiters")
    op.drop_column("recruiters", "email_status")
