"""Hash existing plaintext access keys with bcrypt, add key_hash + key_prefix columns.

Revision ID: 020_bcrypt_access_keys
Revises: 019_admin_approval_and_job_user
Create Date: 2025-07-17
"""
from alembic import op
import sqlalchemy as sa

revision = "020_bcrypt_access_keys"
down_revision = "019_admin_approval_and_job_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns (nullable initially)
    op.add_column("access_keys", sa.Column("key_hash", sa.String(200), nullable=True))
    op.add_column("access_keys", sa.Column("key_prefix", sa.String(8), nullable=True))
    op.create_index("ix_access_keys_key_prefix", "access_keys", ["key_prefix"])

    # 2. Backfill existing rows: hash the plaintext key with bcrypt
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, key FROM access_keys WHERE key IS NOT NULL")
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

    # 3. Make key column nullable (legacy), key_hash NOT NULL for future rows
    #    We can't make key_hash NOT NULL yet because we just populated it; alter after backfill
    op.alter_column("access_keys", "key", nullable=True)
    # For rows that already have key_hash set, enforce NOT NULL going forward
    # (skip strict NOT NULL to avoid issues with empty tables)


def downgrade() -> None:
    op.drop_index("ix_access_keys_key_prefix", table_name="access_keys")
    op.drop_column("access_keys", "key_prefix")
    op.drop_column("access_keys", "key_hash")
    op.alter_column("access_keys", "key", nullable=False)
