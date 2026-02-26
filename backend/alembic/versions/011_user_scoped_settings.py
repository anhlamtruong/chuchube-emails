"""Add user_id to settings and migrate existing rows.

Revision ID: 011
Revises: 010
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa

revision = "011_user_scoped_settings"
down_revision = "010_create_sender_accounts"
branch_labels = None
depends_on = None

# The user_id to assign to all existing global settings rows
TARGET_USER_ID = "user_3ABxlstfC7GShKC13A9yH9iYUkH"


def upgrade():
    # 1. Add user_id column (nullable first so existing rows survive)
    op.add_column("settings", sa.Column("user_id", sa.String(255), nullable=True))

    # 2. Backfill all existing rows with the target user
    op.execute(f"UPDATE settings SET user_id = '{TARGET_USER_ID}' WHERE user_id IS NULL")

    # 3. Make user_id NOT NULL
    op.alter_column("settings", "user_id", nullable=False)

    # 4. Drop old unique index on key alone (created by SQLAlchemy as ix_settings_key)
    op.drop_index("ix_settings_key", table_name="settings")

    # 5. Re-create key index (non-unique)
    op.create_index("ix_settings_key", "settings", ["key"])

    # 6. Add composite unique constraint (user_id, key)
    op.create_unique_constraint("uq_settings_user_key", "settings", ["user_id", "key"])

    # 7. Add index on user_id for fast lookups
    op.create_index("ix_settings_user_id", "settings", ["user_id"])


def downgrade():
    op.drop_index("ix_settings_user_id", table_name="settings")
    op.drop_constraint("uq_settings_user_key", "settings", type_="unique")
    op.drop_index("ix_settings_key", table_name="settings")
    op.create_index("ix_settings_key", "settings", ["key"], unique=True)
    op.drop_column("settings", "user_id")
