"""Add job_results table for persistent Celery task tracking.

Revision ID: 003_add_job_results
Revises: 002_add_scheduled_at
Create Date: 2026-02-22
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "003_add_job_results"
down_revision = "002_add_scheduled_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("celery_task_id", sa.String(255), nullable=True, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued", index=True),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("job_results")
