"""Add is_default column to templates.

Revision ID: 014_add_template_is_default
Revises: 013_custom_column_definitions
Create Date: 2026-02-27
"""
from alembic import op
import sqlalchemy as sa

revision = "014_add_template_is_default"
down_revision = "013_custom_column_definitions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "templates",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Partial unique index: only one is_default=true per user_id
    op.create_index(
        "uq_template_default_per_user",
        "templates",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )


def downgrade():
    op.drop_index("uq_template_default_per_user", table_name="templates")
    op.drop_column("templates", "is_default")
