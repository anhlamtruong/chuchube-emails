"""021 – create user_roles table for multi-admin RBAC.

Revision ID: 021_user_roles
Revises: 020_bcrypt_access_keys
Create Date: 2026-03-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import os

revision = "021_user_roles"
down_revision = "020_bcrypt_access_keys"
branch_labels = None
depends_on = None

# Seed the master admin from env var (same value used throughout app history)
_MASTER_ADMIN_UID = os.getenv("ADMIN_USER_ID", "user_3ABxlstfC7GShKC13A9yH9iYUkH")


def upgrade() -> None:
    op.create_table(
        "user_roles",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(200), nullable=False, unique=True, index=True),
        sa.Column("email", sa.String(500), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("assigned_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )

    # Seed the master admin
    op.execute(
        sa.text(
            "INSERT INTO user_roles (id, user_id, role) "
            "VALUES (gen_random_uuid(), :uid, 'master_admin') "
            "ON CONFLICT (user_id) DO NOTHING"
        ).bindparams(uid=_MASTER_ADMIN_UID)
    )


def downgrade() -> None:
    op.drop_table("user_roles")
