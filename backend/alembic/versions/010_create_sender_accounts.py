"""Create sender_accounts table.

Revision ID: 010_create_sender_accounts
Revises: 009_add_user_id_to_documents
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "010_create_sender_accounts"
down_revision = "009_add_user_id_to_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sender_accounts",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.String(200), nullable=False, index=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("smtp_host", sa.String(200), nullable=True),
        sa.Column("smtp_port", sa.Integer, nullable=True),
        sa.Column("vault_secret_name", sa.String(300), unique=True, nullable=False),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("sender_accounts")
