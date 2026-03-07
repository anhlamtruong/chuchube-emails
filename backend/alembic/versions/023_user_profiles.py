"""Create user_profiles table for admin job views.

Revision ID: 023_user_profiles
Revises: 022_add_scheduled_at
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa

revision = "023_user_profiles"
down_revision = "022_add_scheduled_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.String(200), primary_key=True),
        sa.Column("email", sa.String(500), nullable=True),
        sa.Column("name", sa.String(500), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_user_profiles_email", "user_profiles", ["email"])


def downgrade() -> None:
    op.drop_index("ix_user_profiles_email", table_name="user_profiles")
    op.drop_table("user_profiles")
