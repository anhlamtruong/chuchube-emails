"""Add ooo_return_date to recruiters and referrals.

Revision ID: 018_ooo_return_date
Revises: 017_bounce_detection
Create Date: 2025-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "018_ooo_return_date"
down_revision = "017_bounce_detection"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("recruiters", sa.Column("ooo_return_date", sa.Date(), nullable=True))
    op.add_column("referrals", sa.Column("ooo_return_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("referrals", "ooo_return_date")
    op.drop_column("recruiters", "ooo_return_date")
