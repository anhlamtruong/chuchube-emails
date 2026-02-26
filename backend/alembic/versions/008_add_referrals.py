"""Add referrals table and referral_id FK on email_columns.

Revision ID: 008_add_referrals
Revises: 007_add_user_consent
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "008_add_referrals"
down_revision = "007_add_user_consent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "referrals",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True, index=True),
        sa.Column("company", sa.String(200), nullable=False, server_default="", index=True),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("location", sa.String(200), nullable=False, server_default="", index=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.add_column(
        "email_columns",
        sa.Column(
            "referral_id",
            UUID(as_uuid=False),
            sa.ForeignKey("referrals.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("email_columns", "referral_id")
    op.drop_table("referrals")
