"""Add row_ids column to job_results table.

Revision ID: 006_add_row_ids_to_job_results
Revises: 005_convert_to_uuid
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "006_add_row_ids_to_job_results"
down_revision = "005_convert_to_uuid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("job_results", sa.Column("row_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("job_results", "row_ids")
