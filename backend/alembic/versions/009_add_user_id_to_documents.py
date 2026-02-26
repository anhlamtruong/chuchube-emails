"""Add user_id column to documents table.

Revision ID: 009_add_user_id_to_documents
Revises: 008_add_referrals
"""
from alembic import op
import sqlalchemy as sa

revision = "009_add_user_id_to_documents"
down_revision = "008_add_referrals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("user_id", sa.String(200), nullable=True))
    op.create_index("ix_documents_user_id", "documents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_column("documents", "user_id")
