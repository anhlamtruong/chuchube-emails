"""Schema hardening — missing indexes, NOT NULL, unique constraints, updated_at trigger.

Fixes identified in audit:
  - Backfill null key_hash rows → deactivate them
  - ALTER access_keys.key_hash SET NOT NULL
  - Add indexes on email_columns.recruiter_id, .referral_id, .sender_email
  - Add index on access_keys.used_by_user_id
  - Add UNIQUE(user_id, email) on sender_accounts
  - Create reusable updated_at trigger function

Revision ID: 028_schema_hardening
Revises: 027_email_threads
"""
from alembic import op
import sqlalchemy as sa

revision = "028_schema_hardening"
down_revision = "027_email_threads"
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ #
    # 1. Backfill + enforce NOT NULL on access_keys.key_hash              #
    # ------------------------------------------------------------------ #
    # Deactivate any rows that still have a NULL key_hash (legacy
    # plaintext keys that were not migrated in 024).
    op.execute(
        "UPDATE access_keys SET is_active = false "
        "WHERE key_hash IS NULL"
    )
    op.alter_column(
        "access_keys", "key_hash",
        existing_type=sa.String(200),
        nullable=False,
    )

    # ------------------------------------------------------------------ #
    # 2. Missing FK indexes on email_columns                              #
    # ------------------------------------------------------------------ #
    op.create_index(
        "ix_email_columns_recruiter_id",
        "email_columns",
        ["recruiter_id"],
    )
    op.create_index(
        "ix_email_columns_referral_id",
        "email_columns",
        ["referral_id"],
    )
    op.create_index(
        "ix_email_columns_sender_email",
        "email_columns",
        ["sender_email"],
    )

    # ------------------------------------------------------------------ #
    # 3. Index on access_keys.used_by_user_id                             #
    # ------------------------------------------------------------------ #
    op.create_index(
        "ix_access_keys_used_by_user_id",
        "access_keys",
        ["used_by_user_id"],
    )

    # ------------------------------------------------------------------ #
    # 4. Unique constraint: one email per user in sender_accounts         #
    # ------------------------------------------------------------------ #
    op.create_unique_constraint(
        "uq_sender_accounts_user_email",
        "sender_accounts",
        ["user_id", "email"],
    )

    # ------------------------------------------------------------------ #
    # 5. Reusable updated_at trigger function                             #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Apply trigger to tables that have an updated_at column
    _tables_with_updated_at = [
        "email_columns",
        "sender_accounts",
        "email_threads",
        "templates",
        "settings",
        "recruiters",
        "referrals",
    ]
    for table in _tables_with_updated_at:
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """)


def downgrade():
    # Drop triggers
    _tables_with_updated_at = [
        "email_columns",
        "sender_accounts",
        "email_threads",
        "templates",
        "settings",
        "recruiters",
        "referrals",
    ]
    for table in _tables_with_updated_at:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")

    # Drop unique constraint
    op.drop_constraint("uq_sender_accounts_user_email", "sender_accounts", type_="unique")

    # Drop indexes
    op.drop_index("ix_access_keys_used_by_user_id", table_name="access_keys")
    op.drop_index("ix_email_columns_sender_email", table_name="email_columns")
    op.drop_index("ix_email_columns_referral_id", table_name="email_columns")
    op.drop_index("ix_email_columns_recruiter_id", table_name="email_columns")

    # Revert NOT NULL (allow NULL again)
    op.alter_column(
        "access_keys", "key_hash",
        existing_type=sa.String(200),
        nullable=True,
    )
