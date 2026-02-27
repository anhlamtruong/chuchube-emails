"""Create access_keys table.

Revision ID: 016_add_access_keys
Revises: 015_add_sender_org_fields
Create Date: 2026-02-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "016_add_access_keys"
down_revision = "015_add_sender_org_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "access_keys",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("key", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("label", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("used_by_user_id", sa.String(200), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade():
    op.drop_table("access_keys")
