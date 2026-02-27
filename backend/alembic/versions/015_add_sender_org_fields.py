"""Add organization fields to sender_accounts.

Revision ID: 015_add_sender_org_fields
Revises: 014_add_template_is_default
Create Date: 2026-02-27
"""
from alembic import op
import sqlalchemy as sa

revision = "015_add_sender_org_fields"
down_revision = "014_add_template_is_default"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sender_accounts", sa.Column("organization_name", sa.String(300), nullable=True))
    op.add_column("sender_accounts", sa.Column("organization_type", sa.String(20), nullable=True))  # "school" | "company"
    op.add_column("sender_accounts", sa.Column("title", sa.String(200), nullable=True))
    op.add_column("sender_accounts", sa.Column("city", sa.String(200), nullable=True))


def downgrade():
    op.drop_column("sender_accounts", "city")
    op.drop_column("sender_accounts", "title")
    op.drop_column("sender_accounts", "organization_type")
    op.drop_column("sender_accounts", "organization_name")
