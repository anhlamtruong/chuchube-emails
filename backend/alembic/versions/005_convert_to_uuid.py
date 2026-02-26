"""Convert all integer PKs to UUID.

Revision ID: 005_convert_to_uuid
Revises: 004_add_user_id
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "005_convert_to_uuid"
down_revision = "004_add_user_id"
branch_labels = None
depends_on = None

# Tables with simple integer PK → UUID (no FK references TO them except recruiters)
SIMPLE_TABLES = ["documents", "templates", "settings", "job_results"]

def upgrade() -> None:
    # Ensure the uuid-ossp extension exists for gen_random_uuid()
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # --- 1. Handle recruiters + email_columns FK relationship ---

    # Drop the FK constraint on email_columns.recruiter_id first
    op.drop_constraint(
        "email_columns_recruiter_id_fkey", "email_columns", type_="foreignkey"
    )

    # Convert recruiters.id from INTEGER to UUID
    # Add a temp UUID column, populate, drop old, rename
    op.add_column("recruiters", sa.Column("uuid_id", UUID(as_uuid=False), nullable=True))
    op.execute("UPDATE recruiters SET uuid_id = gen_random_uuid()")
    op.alter_column("recruiters", "uuid_id", nullable=False)

    # Add temp UUID column on email_columns for recruiter_id mapping
    op.add_column("email_columns", sa.Column("uuid_recruiter_id", UUID(as_uuid=False), nullable=True))
    op.execute("""
        UPDATE email_columns ec
        SET uuid_recruiter_id = r.uuid_id
        FROM recruiters r
        WHERE ec.recruiter_id = r.id
    """)

    # Drop old recruiter_id column and rename
    op.drop_column("email_columns", "recruiter_id")
    op.alter_column("email_columns", "uuid_recruiter_id", new_column_name="recruiter_id")

    # Drop old recruiters.id and rename uuid_id
    op.drop_column("recruiters", "id")
    op.alter_column("recruiters", "uuid_id", new_column_name="id")

    # Add PK constraint back on recruiters
    op.create_primary_key("recruiters_pkey", "recruiters", ["id"])

    # Re-create the FK
    op.create_foreign_key(
        "email_columns_recruiter_id_fkey",
        "email_columns", "recruiters",
        ["recruiter_id"], ["id"],
        ondelete="SET NULL",
    )

    # --- 2. Convert email_columns.id from INTEGER to UUID ---
    op.add_column("email_columns", sa.Column("uuid_id", UUID(as_uuid=False), nullable=True))
    op.execute("UPDATE email_columns SET uuid_id = gen_random_uuid()")
    op.alter_column("email_columns", "uuid_id", nullable=False)
    op.drop_column("email_columns", "id")
    op.alter_column("email_columns", "uuid_id", new_column_name="id")
    op.create_primary_key("email_columns_pkey", "email_columns", ["id"])

    # --- 3. Convert simple tables ---
    for table in SIMPLE_TABLES:
        op.add_column(table, sa.Column("uuid_id", UUID(as_uuid=False), nullable=True))
        op.execute(f"UPDATE {table} SET uuid_id = gen_random_uuid()")
        op.alter_column(table, "uuid_id", nullable=False)
        op.drop_column(table, "id")
        op.alter_column(table, "uuid_id", new_column_name="id")
        op.create_primary_key(f"{table}_pkey", table, ["id"])


def downgrade() -> None:
    # Downgrade not supported for UUID → integer conversion
    raise NotImplementedError("Cannot downgrade UUID columns back to integer")
