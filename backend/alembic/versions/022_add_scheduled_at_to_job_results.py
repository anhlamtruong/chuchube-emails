"""Add scheduled_at column to job_results for calendar display.

Revision ID: 022_add_scheduled_at
Revises: 021_user_roles
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa

revision = "022_add_scheduled_at"
down_revision = "021_user_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "job_results",
        sa.Column("scheduled_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_job_results_scheduled_at", "job_results", ["scheduled_at"])


def downgrade() -> None:
    op.drop_index("ix_job_results_scheduled_at", table_name="job_results")
    op.drop_column("job_results", "scheduled_at")
