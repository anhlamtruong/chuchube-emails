import os
import sqlite3
import json
from datetime import datetime
from sqlalchemy import create_engine, text

SQLITE_PATH = os.getenv("SQLITE_PATH", "/app/data/data.db")
PG_URL = os.getenv("DATABASE_URL")

if not PG_URL or PG_URL.startswith("sqlite"):
    raise SystemExit("Set DATABASE_URL to the Supabase URL before running.")

print(f"Source SQLite: {SQLITE_PATH}")
print(f"Target Postgres: {PG_URL}")

sqlite = sqlite3.connect(SQLITE_PATH)
sqlite.row_factory = sqlite3.Row
pg = create_engine(PG_URL)


def fetch_rows(table):
    return [dict(r) for r in sqlite.execute(f"SELECT * FROM {table}").fetchall()]


def parse_dt(value):
    if value is None:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            pass
    return value


def reset_sequence(conn, table):
    conn.execute(text(
        f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
        f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
    ))


with pg.begin() as conn:
    # --- recruiters ---
    print("Migrating recruiters...")
    for r in fetch_rows("recruiters"):
        conn.execute(
            text(
                "INSERT INTO recruiters "
                "(id, name, email, company, title, location, notes, created_at, updated_at) "
                "VALUES (:id, :name, :email, :company, :title, :location, :notes, :created_at, :updated_at) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                **r,
                "created_at": parse_dt(r.get("created_at")),
                "updated_at": parse_dt(r.get("updated_at")),
            },
        )
    reset_sequence(conn, "recruiters")

    # --- templates ---
    print("Migrating templates...")
    for r in fetch_rows("templates"):
        conn.execute(
            text(
                "INSERT INTO templates "
                "(id, name, subject_line, body_html, created_at, updated_at) "
                "VALUES (:id, :name, :subject_line, :body_html, :created_at, :updated_at) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                **r,
                "created_at": parse_dt(r.get("created_at")),
                "updated_at": parse_dt(r.get("updated_at")),
            },
        )
    reset_sequence(conn, "templates")

    # --- email_columns ---
    print("Migrating email_columns...")
    for r in fetch_rows("email_columns"):
        cf = r.get("custom_fields")
        if isinstance(cf, str):
            try:
                cf = json.loads(cf)
            except Exception:
                cf = None
        conn.execute(
            text(
                "INSERT INTO email_columns "
                "(id, sender_email, recipient_name, recipient_email, company, position, "
                "template_file, framework, my_strength, audience_value, custom_fields, "
                "sent_status, sent_at, scheduled_at, recruiter_id, created_at, updated_at) "
                "VALUES (:id, :sender_email, :recipient_name, :recipient_email, :company, :position, "
                ":template_file, :framework, :my_strength, :audience_value, :custom_fields, "
                ":sent_status, :sent_at, :scheduled_at, :recruiter_id, :created_at, :updated_at) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                **r,
                "custom_fields": json.dumps(cf) if cf is not None else None,
                "sent_at": parse_dt(r.get("sent_at")),
                "scheduled_at": parse_dt(r.get("scheduled_at")),
                "created_at": parse_dt(r.get("created_at")),
                "updated_at": parse_dt(r.get("updated_at")),
            },
        )
    reset_sequence(conn, "email_columns")

    # --- documents ---
    print("Migrating documents...")
    for r in fetch_rows("documents"):
        conn.execute(
            text(
                "INSERT INTO documents "
                "(id, filename, original_name, file_path, mime_type, size_bytes, scope, scope_ref, created_at) "
                "VALUES (:id, :filename, :original_name, :file_path, :mime_type, :size_bytes, :scope, :scope_ref, :created_at) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                **r,
                "created_at": parse_dt(r.get("created_at")),
            },
        )
    reset_sequence(conn, "documents")

    # --- settings ---
    print("Migrating settings...")
    for r in fetch_rows("settings"):
        conn.execute(
            text(
                "INSERT INTO settings "
                "(id, key, value, description, updated_at) "
                "VALUES (:id, :key, :value, :description, :updated_at) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                **r,
                "updated_at": parse_dt(r.get("updated_at")),
            },
        )
    reset_sequence(conn, "settings")

sqlite.close()
print("Migration complete!")
