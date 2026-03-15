from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import DATABASE_URL
from app.logging_config import get_logger

_db_logger = get_logger("database")

# connect_args is only needed for SQLite; detect driver from URL.
# For PostgreSQL (Supabase via PgBouncer) we enable TCP keepalives so the OS
# detects dead connections before SQLAlchemy tries to use them.
if DATABASE_URL.startswith("sqlite"):
    _connect_args: dict = {"check_same_thread": False}
else:
    _connect_args = {
        "connect_timeout": 10,        # fail fast on unreachable host
        "keepalives": 1,              # enable TCP keepalives
        "keepalives_idle": 30,        # first probe after 30 s idle
        "keepalives_interval": 10,    # re-probe every 10 s
        "keepalives_count": 5,        # give up after 5 failures (~80 s)
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,       # test connections before checkout (fixes Supabase idle drops)
    pool_recycle=270,          # recycle connections every 4.5 min (Supabase drops idle after ~5 min)
    pool_size=5,               # baseline connection pool size
    max_overflow=10,           # allow up to 15 total connections under load
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        _db_logger.warning("Rolling back DB session due to unhandled exception")
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """Create tables and stamp Alembic version for new databases.

    NOTE: This does NOT run ``alembic upgrade`` on startup because Supabase's
    PgBouncer (transaction-mode) does not support the advisory locks that
    Alembic requires.  Run migrations explicitly via:
        alembic upgrade head
    """
    import logging
    _log = logging.getLogger("database")

    # Always ensure tables exist (safe for both new & existing DBs)
    Base.metadata.create_all(bind=engine)

    # Check if alembic_version table already exists
    inspector = inspect(engine)
    has_alembic = "alembic_version" in inspector.get_table_names()

    if has_alembic:
        _log.info("Alembic version table found — skipping auto-migration (run 'alembic upgrade head' manually)")
        return

    # New database — stamp as current so future migrations work
    try:
        from alembic.config import Config
        from alembic import command
        import os

        alembic_cfg_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
        if os.path.exists(alembic_cfg_path):
            alembic_cfg = Config(alembic_cfg_path)
            # Escape '%' for configparser interpolation (e.g. URL-encoded passwords)
            alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
            command.stamp(alembic_cfg, "head")
            _log.info("Stamped new database at Alembic head")
    except Exception:
        _log.warning("Alembic stamp failed — tables were created by create_all", exc_info=True)
