"""Migrate remaining plaintext access keys to bcrypt and clear the legacy column.

Revision ID: 024_cleanup_plaintext_keys
Revises: 023_user_profiles
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = "024_cleanup_plaintext_keys"
down_revision = "023_user_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Hash any remaining plaintext keys and NULL out the legacy 'key' column."""
    conn = op.get_bind()

    # Find rows that still have a plaintext key but no bcrypt hash
    rows = conn.execute(
        sa.text(
            "SELECT id, key FROM access_keys "
            "WHERE key IS NOT NULL AND (key_hash IS NULL OR key_hash = '')"
        )
    ).fetchall()

    if rows:
        import bcrypt

        for row in rows:
            key_id, plaintext = row[0], row[1]
            hashed = bcrypt.hashpw(plaintext.encode(), bcrypt.gensalt()).decode()
            prefix = plaintext[:8]
            conn.execute(
                sa.text(
                    "UPDATE access_keys SET key_hash = :h, key_prefix = :p WHERE id = :id"
                ),
                {"h": hashed, "p": prefix, "id": key_id},
            )

    # Clear all plaintext values — bcrypt hashes are now the sole credential store
    conn.execute(sa.text("UPDATE access_keys SET key = NULL WHERE key IS NOT NULL"))


def downgrade() -> None:
    # Cannot restore plaintext keys from bcrypt hashes — this is a one-way migration.
    pass
