"""One-off script to query stale jobs from the database."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from sqlalchemy import create_engine, text

engine = create_engine(os.environ['DATABASE_URL'])
with engine.connect() as conn:
    rows = conn.execute(text("""
        SELECT id, status, total, sent, failed, user_id,
               scheduled_at, created_at, completed_at, errors
        FROM job_results
        WHERE id = 'f25545a3-de67-475a-a434-336c049ff735' OR status = 'stale'
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 10
    """)).fetchall()
    print("=== STALE / TARGET JOBS ===")
    for r in rows:
        print(f"ID: {r[0]}")
        print(f"  status={r[1]}, total={r[2]}, sent={r[3]}, failed={r[4]}")
        print(f"  user_id={r[5]}")
        print(f"  scheduled_at={r[6]}")
        print(f"  created_at={r[7]}")
        print(f"  completed_at={r[8]}")
        print(f"  errors={r[9]}")
        print()

    # Also check the email rows for this job
    rows2 = conn.execute(text("""
        SELECT id, sent_status, scheduled_at, recipient_email, sender_email
        FROM email_columns
        WHERE id IN (
            SELECT unnest(row_ids) FROM job_results
            WHERE id = 'f25545a3-de67-475a-a434-336c049ff735'
        )
        LIMIT 5
    """)).fetchall()
    print("=== EMAIL ROWS FOR THIS JOB ===")
    for r in rows2:
        print(f"  email_id={r[0]}, status={r[1]}, scheduled_at={r[2]}, to={r[3]}, from={r[4]}")
