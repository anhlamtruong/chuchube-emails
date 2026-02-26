"""Initial migration — baseline of all existing tables.

Revision ID: 001_initial
Revises: 
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Recruiters ---
    op.create_table(
        'recruiters',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('name', sa.String(200), nullable=False, server_default=''),
        sa.Column('email', sa.String(320), nullable=False, unique=True),
        sa.Column('company', sa.String(200), nullable=False, server_default=''),
        sa.Column('title', sa.String(200), nullable=False, server_default=''),
        sa.Column('location', sa.String(200), nullable=False, server_default=''),
        sa.Column('notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # --- Templates ---
    op.create_table(
        'templates',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('name', sa.String(200), nullable=False, unique=True),
        sa.Column('subject_line', sa.String(500), nullable=False, server_default=''),
        sa.Column('body_html', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # --- Email Columns (Campaign rows) ---
    op.create_table(
        'email_columns',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('sender_email', sa.String(320), nullable=False, server_default=''),
        sa.Column('recipient_name', sa.String(200), nullable=False, server_default=''),
        sa.Column('recipient_email', sa.String(320), nullable=False, server_default=''),
        sa.Column('company', sa.String(200), nullable=False, server_default=''),
        sa.Column('position', sa.String(200), nullable=False, server_default=''),
        sa.Column('template_file', sa.String(200), nullable=False, server_default=''),
        sa.Column('framework', sa.String(50), nullable=False, server_default='passion'),
        sa.Column('my_strength', sa.Text(), nullable=False, server_default=''),
        sa.Column('audience_value', sa.Text(), nullable=False, server_default=''),
        sa.Column('custom_fields', sa.JSON(), nullable=True),
        sa.Column('sent_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('recruiter_id', sa.Integer(), sa.ForeignKey('recruiters.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # --- Documents ---
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('original_name', sa.String(500), nullable=False),
        sa.Column('file_path', sa.String(1000), nullable=False),
        sa.Column('mime_type', sa.String(200), nullable=False, server_default='application/octet-stream'),
        sa.Column('size_bytes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('scope', sa.String(20), nullable=False, server_default='global', index=True),
        sa.Column('scope_ref', sa.String(320), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # --- Settings ---
    op.create_table(
        'settings',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('key', sa.String(100), nullable=False, unique=True),
        sa.Column('value', sa.Text(), nullable=False, server_default=''),
        sa.Column('description', sa.String(500), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('settings')
    op.drop_table('documents')
    op.drop_table('email_columns')
    op.drop_table('templates')
    op.drop_table('recruiters')
