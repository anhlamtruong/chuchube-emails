"""Detect and optionally clean up invalid email addresses in the database.

Usage:
    # Dry-run (report only):
    python scripts/cleanup_invalid_emails.py

    # Actually fix (set bad emails to empty string):
    python scripts/cleanup_invalid_emails.py --fix

Requires DATABASE_URL in .env (or as an environment variable).
"""
import os
import re
import sys

from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Add it to .env or set as env var.")
    sys.exit(1)

# Basic email regex — intentionally lenient (just needs @something.something)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Tables and their email columns to audit
TARGETS = [
    ("recruiters", ["email"]),
    ("referrals", ["email"]),
    ("email_columns", ["sender_email", "recipient_email"]),
]

FIX_MODE = "--fix" in sys.argv


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    total_bad = 0

    try:
        with conn.cursor() as cur:
            for table, columns in TARGETS:
                for col in columns:
                    # Use sql.Identifier to safely inject table/column names
                    query = sql.SQL(
                        "SELECT id, {col} FROM {table} WHERE {col} IS NOT NULL AND {col} != ''"
                    ).format(
                        col=sql.Identifier(col),
                        table=sql.Identifier(table),
                    )
                    cur.execute(query)
                    rows = cur.fetchall()

                    bad_rows = [
                        (row_id, email)
                        for row_id, email in rows
                        if not EMAIL_RE.match(str(email).strip())
                    ]

                    if bad_rows:
                        print(f"\n{'='*60}")
                        print(f"  {table}.{col}: {len(bad_rows)} invalid email(s)")
                        print(f"{'='*60}")
                        for row_id, email in bad_rows[:20]:
                            print(f"  id={row_id}  email={email!r}")
                        if len(bad_rows) > 20:
                            print(f"  ... and {len(bad_rows) - 20} more")

                        if FIX_MODE:
                            ids = [r[0] for r in bad_rows]
                            # Set bad emails to empty string (rather than NULL) to
                            # avoid NOT NULL constraint violations
                            update_query = sql.SQL(
                                "UPDATE {table} SET {col} = '' WHERE id = ANY(%s)"
                            ).format(
                                table=sql.Identifier(table),
                                col=sql.Identifier(col),
                            )
                            cur.execute(update_query, (ids,))
                            conn.commit()
                            print(f"  => FIXED: set {len(ids)} row(s) to empty string")

                        total_bad += len(bad_rows)
    finally:
        conn.close()

    if total_bad == 0:
        print("\nAll email addresses look valid. Nothing to clean up.")
    else:
        print(f"\nTotal invalid emails found: {total_bad}")
        if not FIX_MODE:
            print("Run with --fix to clean them up.")


if __name__ == "__main__":
    main()
