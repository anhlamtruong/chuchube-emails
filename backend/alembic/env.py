"""Alembic environment configuration."""
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.database import Base
from app.config import DATABASE_URL

# Import all models so Alembic can see them
from app.models.recruiter import Recruiter  # noqa: F401
from app.models.email_column import EmailColumn  # noqa: F401
from app.models.template import Template  # noqa: F401
from app.models.document import Document  # noqa: F401
from app.models.setting import Setting  # noqa: F401
from app.models.job_result import JobResult  # noqa: F401
from app.models.access_key import AccessKey  # noqa: F401
from app.models.user_role import UserRole  # noqa: F401
from app.models.user_profile import UserProfile  # noqa: F401

config = context.config

# Override sqlalchemy.url with the app's DATABASE_URL.
# Use %% to escape the % so configparser doesn't treat it as interpolation.
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# render_as_batch is only needed for SQLite (no native ALTER TABLE)
_is_sqlite = DATABASE_URL.startswith("sqlite")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=_is_sqlite,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=_is_sqlite,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
