"""Add user_consents table for per-user legal policy tracking.

Revision ID: 007_add_user_consent
Revises: 006_add_row_ids_to_job_results
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "007_add_user_consent"
down_revision = "006_add_row_ids_to_job_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_consents",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.String(200), nullable=False, index=True),
        sa.Column("consent_type", sa.String(50), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.UniqueConstraint("user_id", "consent_type", "version", name="uq_user_consent"),
    )


def downgrade() -> None:
    op.drop_table("user_consents")
