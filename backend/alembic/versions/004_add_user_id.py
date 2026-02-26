"""Add user_id to templates and email_columns for per-user scoping.

Revision ID: 004_add_user_id
Revises: 003_add_job_results
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "004_add_user_id"
down_revision = "003_add_job_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add user_id columns
    op.add_column("templates", sa.Column("user_id", sa.String(200), nullable=True))
    op.add_column("email_columns", sa.Column("user_id", sa.String(200), nullable=True))

    # Add indexes
    op.create_index("ix_templates_user_id", "templates", ["user_id"])
    op.create_index("ix_email_columns_user_id", "email_columns", ["user_id"])

    # Drop old unique constraint on templates.name and replace with composite
    op.drop_constraint("templates_name_key", "templates", type_="unique")
    op.create_unique_constraint("uq_template_name_user", "templates", ["name", "user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_template_name_user", "templates", type_="unique")
    op.create_unique_constraint("templates_name_key", "templates", ["name"])
    op.drop_index("ix_email_columns_user_id", "email_columns")
    op.drop_index("ix_templates_user_id", "templates")
    op.drop_column("email_columns", "user_id")
    op.drop_column("templates", "user_id")
