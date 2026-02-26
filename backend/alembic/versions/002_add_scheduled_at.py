"""Add scheduled_at column to email_columns.

Revision ID: 002_add_scheduled_at
Revises: 001_initial
Create Date: 2026-02-20

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002_add_scheduled_at'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'email_columns',
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_email_columns_scheduled_at',
        'email_columns',
        ['scheduled_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_email_columns_scheduled_at', table_name='email_columns')
    op.drop_column('email_columns', 'scheduled_at')
