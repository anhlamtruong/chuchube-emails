"""Add RLS policies for email_threads, thread_messages, custom_column_definitions.

Migration 027 enabled RLS on email_threads and thread_messages but created
zero policies — any Supabase client-SDK queries would silently return empty.
Migration 013 created custom_column_definitions but never enabled RLS.

This migration adds the matching SELECT/INSERT/UPDATE/DELETE policies using
the same pattern established in 012_security_hardening.

Revision ID: 029_rls_policies
Revises: 028_schema_hardening
"""
from alembic import op

revision = "029_rls_policies"
down_revision = "028_schema_hardening"
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ #
    # 1. email_threads (user_id, NOT NULL)                                #
    # ------------------------------------------------------------------ #
    for action, clause in [
        ("SELECT", "USING (user_id = auth.uid()::text)"),
        ("INSERT", "WITH CHECK (user_id = auth.uid()::text)"),
        (
            "UPDATE",
            "USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text)",
        ),
        ("DELETE", "USING (user_id = auth.uid()::text)"),
    ]:
        op.execute(
            f"CREATE POLICY email_threads_{action.lower()}_own "
            f"ON email_threads FOR {action} TO authenticated {clause}"
        )

    # ------------------------------------------------------------------ #
    # 2. thread_messages                                                  #
    #    No user_id column — scope via the parent thread.                 #
    #    Use a sub-select to match the thread's user_id.                  #
    # ------------------------------------------------------------------ #
    _tm_using = (
        "USING (thread_id IN ("
        "SELECT id FROM email_threads WHERE user_id = auth.uid()::text"
        "))"
    )
    _tm_check = (
        "WITH CHECK (thread_id IN ("
        "SELECT id FROM email_threads WHERE user_id = auth.uid()::text"
        "))"
    )
    for action, clause in [
        ("SELECT", _tm_using),
        ("INSERT", _tm_check),
        ("UPDATE", f"{_tm_using} {_tm_check}"),
        ("DELETE", _tm_using),
    ]:
        op.execute(
            f"CREATE POLICY thread_messages_{action.lower()}_own "
            f"ON thread_messages FOR {action} TO authenticated {clause}"
        )

    # ------------------------------------------------------------------ #
    # 3. custom_column_definitions (user_id, NOT NULL)                    #
    # ------------------------------------------------------------------ #
    op.execute(
        "ALTER TABLE custom_column_definitions ENABLE ROW LEVEL SECURITY"
    )
    for action, clause in [
        ("SELECT", "USING (user_id = auth.uid()::text)"),
        ("INSERT", "WITH CHECK (user_id = auth.uid()::text)"),
        (
            "UPDATE",
            "USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text)",
        ),
        ("DELETE", "USING (user_id = auth.uid()::text)"),
    ]:
        op.execute(
            f"CREATE POLICY custom_column_definitions_{action.lower()}_own "
            f"ON custom_column_definitions FOR {action} TO authenticated {clause}"
        )


def downgrade():
    # custom_column_definitions
    for action in ("select", "insert", "update", "delete"):
        op.execute(
            f"DROP POLICY IF EXISTS custom_column_definitions_{action}_own "
            f"ON custom_column_definitions"
        )
    op.execute(
        "ALTER TABLE custom_column_definitions DISABLE ROW LEVEL SECURITY"
    )

    # thread_messages
    for action in ("select", "insert", "update", "delete"):
        op.execute(
            f"DROP POLICY IF EXISTS thread_messages_{action}_own "
            f"ON thread_messages"
        )

    # email_threads
    for action in ("select", "insert", "update", "delete"):
        op.execute(
            f"DROP POLICY IF EXISTS email_threads_{action}_own "
            f"ON email_threads"
        )
