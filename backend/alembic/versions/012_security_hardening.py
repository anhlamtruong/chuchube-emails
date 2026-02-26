"""Security hardening — create audit_logs table + enable RLS on user-scoped tables.

Revision ID: 012_security_hardening
Revises: 011_user_scoped_settings
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "012_security_hardening"
down_revision = "011_user_scoped_settings"
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ #
    # 1. Create audit_logs table                                          #
    # ------------------------------------------------------------------ #
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False, index=True),
        sa.Column("event_type", sa.String(50), nullable=False, index=True),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("detail", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), index=True),
    )

    # ------------------------------------------------------------------ #
    # 2. Enable Row-Level Security on user-scoped tables                  #
    #                                                                     #
    #  Backend connects as the Postgres *table owner* through the         #
    #  Supabase pooler, so RLS is automatically bypassed (owner bypass).  #
    #  Policies target the `authenticated` role used by Supabase client   #
    #  SDKs, acting as a defense-in-depth layer.                         #
    # ------------------------------------------------------------------ #
    _rls_tables = [
        # (table_name, user_id_column, allow_null_user_id)
        ("settings", "user_id", False),
        ("email_columns", "user_id", True),
        ("sender_accounts", "user_id", False),
        ("documents", "user_id", True),
        ("templates", "user_id", True),
        ("user_consents", "user_id", False),
        ("audit_logs", "user_id", False),
    ]

    for table, col, allow_null in _rls_tables:
        # Enable RLS (WITHOUT FORCE — owner bypasses)
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

        null_clause = f" OR {col} IS NULL" if allow_null else ""

        # SELECT policy
        op.execute(
            f"CREATE POLICY {table}_select_own ON {table} "
            f"FOR SELECT TO authenticated "
            f"USING (({col} = auth.uid()::text){null_clause})"
        )
        # INSERT policy
        op.execute(
            f"CREATE POLICY {table}_insert_own ON {table} "
            f"FOR INSERT TO authenticated "
            f"WITH CHECK ({col} = auth.uid()::text)"
        )
        # UPDATE policy
        op.execute(
            f"CREATE POLICY {table}_update_own ON {table} "
            f"FOR UPDATE TO authenticated "
            f"USING (({col} = auth.uid()::text){null_clause}) "
            f"WITH CHECK ({col} = auth.uid()::text)"
        )
        # DELETE policy
        op.execute(
            f"CREATE POLICY {table}_delete_own ON {table} "
            f"FOR DELETE TO authenticated "
            f"USING (({col} = auth.uid()::text){null_clause})"
        )


def downgrade():
    _rls_tables = [
        "audit_logs", "user_consents", "templates", "documents",
        "sender_accounts", "email_columns", "settings",
    ]
    for table in _rls_tables:
        for action in ("select", "insert", "update", "delete"):
            op.execute(f"DROP POLICY IF EXISTS {table}_{action}_own ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("audit_logs")
