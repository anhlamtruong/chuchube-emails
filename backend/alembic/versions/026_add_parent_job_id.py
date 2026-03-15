"""Add parent_job_id to job_results for rerun audit trail.

Revision ID: 026_add_parent_job_id
Revises: 025_index_ooo_return_date
"""
from alembic import op
import sqlalchemy as sa

revision = "026_add_parent_job_id"
down_revision = "025_index_ooo_return_date"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "job_results",
        sa.Column("parent_job_id", sa.String(36), nullable=True),
    )
    op.create_index("ix_job_results_parent_job_id", "job_results", ["parent_job_id"])


def downgrade():
    op.drop_index("ix_job_results_parent_job_id", table_name="job_results")
    op.drop_column("job_results", "parent_job_id")
