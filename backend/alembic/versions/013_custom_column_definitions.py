"""Create custom_column_definitions table.

Revision ID: 013_custom_column_definitions
Revises: 012_security_hardening
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013_custom_column_definitions"
down_revision = "012_security_hardening"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_column_definitions",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(255), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("default_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_custom_col_user_name"),
    )

    # Enable RLS (Supabase best practice)
    op.execute("ALTER TABLE custom_column_definitions ENABLE ROW LEVEL SECURITY")

    # -----------------------------------------------------------------
    # Data migration: scan existing custom_fields JSON keys and create
    # definitions for each user so no data is lost.
    # -----------------------------------------------------------------
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("""
            SELECT DISTINCT ec.user_id, jk.key
            FROM email_columns ec,
                 json_each_text(ec.custom_fields::json) AS jk
            WHERE ec.custom_fields IS NOT NULL
              AND ec.user_id IS NOT NULL
        """)
    ).fetchall()

    if rows:
        # Deduplicate (user_id, key) pairs
        seen: set[tuple[str, str]] = set()
        for user_id, key in rows:
            pair = (user_id, key)
            if pair in seen:
                continue
            seen.add(pair)
            conn.execute(
                sa.text("""
                    INSERT INTO custom_column_definitions (id, user_id, name, default_value, sort_order)
                    VALUES (gen_random_uuid(), :uid, :name, '', :sort)
                    ON CONFLICT (user_id, name) DO NOTHING
                """),
                {"uid": user_id, "name": key, "sort": 0},
            )


def downgrade():
    op.drop_table("custom_column_definitions")
