"""Add user_id + approval_status to recruiters/referrals; user_id to job_results.

Revision ID: 019_admin_approval_and_job_user
Revises: 018_ooo_return_date
Create Date: 2025-07-17
"""
from alembic import op
import sqlalchemy as sa
import os

revision = "019_admin_approval_and_job_user"
down_revision = "018_ooo_return_date"
branch_labels = None
depends_on = None

ADMIN_USER_ID = os.getenv("ADMIN_USER_ID", "user_3ABxlstfC7GShKC13A9yH9iYUkH")


def upgrade() -> None:
    # --- Recruiters: add user_id + approval_status ---
    op.add_column("recruiters", sa.Column("user_id", sa.String(200), nullable=True))
    op.add_column("recruiters", sa.Column("approval_status", sa.String(20), nullable=False, server_default="approved"))
    op.create_index("ix_recruiters_user_id", "recruiters", ["user_id"])
    op.create_index("ix_recruiters_approval_status", "recruiters", ["approval_status"])

    # --- Referrals: add user_id + approval_status ---
    op.add_column("referrals", sa.Column("user_id", sa.String(200), nullable=True))
    op.add_column("referrals", sa.Column("approval_status", sa.String(20), nullable=False, server_default="approved"))
    op.create_index("ix_referrals_user_id", "referrals", ["user_id"])
    op.create_index("ix_referrals_approval_status", "referrals", ["approval_status"])

    # --- Job results: add user_id ---
    op.add_column("job_results", sa.Column("user_id", sa.String(200), nullable=True))
    op.create_index("ix_job_results_user_id", "job_results", ["user_id"])

    # --- Backfill existing rows to ADMIN_USER_ID + approved ---
    op.execute(f"UPDATE recruiters SET user_id = '{ADMIN_USER_ID}' WHERE user_id IS NULL")
    op.execute(f"UPDATE referrals SET user_id = '{ADMIN_USER_ID}' WHERE user_id IS NULL")
    op.execute(f"UPDATE job_results SET user_id = '{ADMIN_USER_ID}' WHERE user_id IS NULL")

    # --- Add composite index on email_columns (user_id, sent_status) ---
    op.create_index("ix_email_columns_user_sent", "email_columns", ["user_id", "sent_status"])

    # --- Add index on email_columns.recipient_email ---
    op.create_index("ix_email_columns_recipient_email", "email_columns", ["recipient_email"])


def downgrade() -> None:
    op.drop_index("ix_email_columns_recipient_email", "email_columns")
    op.drop_index("ix_email_columns_user_sent", "email_columns")
    op.drop_index("ix_job_results_user_id", "job_results")
    op.drop_column("job_results", "user_id")
    op.drop_index("ix_referrals_approval_status", "referrals")
    op.drop_index("ix_referrals_user_id", "referrals")
    op.drop_column("referrals", "approval_status")
    op.drop_column("referrals", "user_id")
    op.drop_index("ix_recruiters_approval_status", "recruiters")
    op.drop_index("ix_recruiters_user_id", "recruiters")
    op.drop_column("recruiters", "approval_status")
    op.drop_column("recruiters", "user_id")
