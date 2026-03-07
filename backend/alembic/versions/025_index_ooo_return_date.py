"""Add index on ooo_return_date for efficient expiry scheduling.

Revision ID: 025_index_ooo_return_date
Revises: 024_cleanup_plaintext_keys
Create Date: 2026-03-10
"""
from alembic import op

revision = "025_index_ooo_return_date"
down_revision = "024_cleanup_plaintext_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_recruiters_ooo_return_date",
        "recruiters",
        ["ooo_return_date"],
        unique=False,
    )
    op.create_index(
        "ix_referrals_ooo_return_date",
        "referrals",
        ["ooo_return_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_referrals_ooo_return_date", table_name="referrals")
    op.drop_index("ix_recruiters_ooo_return_date", table_name="recruiters")
