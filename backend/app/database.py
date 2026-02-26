from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import DATABASE_URL

# connect_args is only needed for SQLite; detect driver from URL
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables — uses Alembic stamp if available, falls back to create_all."""
    # Always ensure tables exist (safe for both new & existing DBs)
    Base.metadata.create_all(bind=engine)

    # Stamp the DB as up-to-date with Alembic so future migrations work
    try:
        from alembic.config import Config
        from alembic import command
        import os

        alembic_cfg_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
        if os.path.exists(alembic_cfg_path):
            alembic_cfg = Config(alembic_cfg_path)
            alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

            # Check if alembic_version table exists
            inspector = inspect(engine)
            if "alembic_version" not in inspector.get_table_names():
                # Stamp as current — DB was created by create_all
                command.stamp(alembic_cfg, "head")
            else:
                # Run any pending migrations
                command.upgrade(alembic_cfg, "head")
    except Exception:
        # Alembic not available or misconfigured — create_all already ran, so tables exist
        pass
