#!/usr/bin/env bash
# ─── Automated Supabase PostgreSQL Backup ──────────────────────────────────
# Performs a pg_dump of the public schema from the remote Supabase instance,
# compresses the output, optionally encrypts it, and rotates old backups.
#
# Environment variables (all set via docker-compose / .env):
#   BACKUP_DATABASE_URL   – Direct Supabase Postgres connection string (port 5432)
#   BACKUP_RETENTION_DAYS – Number of days to keep old backups (default: 7)
#   BACKUP_ENCRYPTION_KEY – GPG passphrase for at-rest encryption (optional)
#   BACKUP_DIR            – Directory to store backups (default: /backups)
# ───────────────────────────────────────────────────────────────────────────
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${BACKUP_DIR}/backup.log"
STATE_FILE="${BACKUP_DIR}/backup_state.json"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

write_state() {
    # Write machine-readable state for the /api/admin/backup-status endpoint
    cat > "$STATE_FILE" <<EOF
{
  "last_backup_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "$1",
  "file": "$2",
  "size_bytes": $3,
  "duration_seconds": $4,
  "error": "$5"
}
EOF
}

# ─── Pre-flight checks ────────────────────────────────────────────────────
if [ -z "$BACKUP_DATABASE_URL" ]; then
    log "ERROR: BACKUP_DATABASE_URL is not set. Aborting."
    write_state "error" "" 0 0 "BACKUP_DATABASE_URL not set"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# ─── Check for active jobs (defer if sends are running) ───────────────────
ACTIVE_JOBS=$(psql "$BACKUP_DATABASE_URL" -t -A -c \
    "SELECT count(*) FROM job_results WHERE status IN ('queued','sending');" 2>/dev/null || echo "0")

RETRY_COUNT=0
MAX_RETRIES=4
RETRY_DELAY=900  # 15 minutes

while [ "$ACTIVE_JOBS" -gt 0 ] && [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; do
    log "WARN: $ACTIVE_JOBS active job(s) detected. Deferring backup by ${RETRY_DELAY}s (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep "$RETRY_DELAY"
    ACTIVE_JOBS=$(psql "$BACKUP_DATABASE_URL" -t -A -c \
        "SELECT count(*) FROM job_results WHERE status IN ('queued','sending');" 2>/dev/null || echo "0")
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$ACTIVE_JOBS" -gt 0 ]; then
    log "WARN: Jobs still active after $MAX_RETRIES retries. Proceeding anyway (pg_dump is non-blocking)."
fi

# ─── Full dump ─────────────────────────────────────────────────────────────
START_TIME=$(date +%s)
DUMP_FILE="${BACKUP_DIR}/chuchube_${TIMESTAMP}.dump"
FINAL_FILE="$DUMP_FILE"

log "Starting full backup → $DUMP_FILE"

# Force IPv4 to avoid IPv6 "Network unreachable" issues in Docker containers
export PGOPTIONS=""
pg_dump "$BACKUP_DATABASE_URL" \
    --schema=public \
    --no-owner \
    --no-acl \
    --format=custom \
    --compress=6 \
    --lock-wait-timeout=30000 \
    --no-sync \
    --file="$DUMP_FILE" 2>&1 | tee -a "$LOG_FILE"
PG_EXIT=${PIPESTATUS[0]}

if [ "$PG_EXIT" -ne 0 ]; then
    log "ERROR: pg_dump failed (exit code $PG_EXIT)"
    write_state "error" "" 0 0 "pg_dump failed (exit $PG_EXIT)"
    rm -f "$DUMP_FILE"
    exit 1
fi

log "pg_dump completed successfully"

# ─── Optional encryption ──────────────────────────────────────────────────
if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
    log "Encrypting backup with AES-256"
    echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 \
        --symmetric --cipher-algo AES256 \
        --output "${DUMP_FILE}.gpg" "$DUMP_FILE"
    rm -f "$DUMP_FILE"
    FINAL_FILE="${DUMP_FILE}.gpg"
    log "Encryption complete → $FINAL_FILE"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
FILE_SIZE=$(stat -c %s "$FINAL_FILE" 2>/dev/null || stat -f %z "$FINAL_FILE" 2>/dev/null || echo 0)

log "Backup complete: $(basename "$FINAL_FILE") (${FILE_SIZE} bytes, ${DURATION}s)"

# ─── Spreadsheet export: recruiters & referrals ───────────────────────────
# Human-readable CSV snapshots so recruiters/referrals can be opened in Excel
EXPORT_DIR="${BACKUP_DIR}/exports"
mkdir -p "$EXPORT_DIR"

for TABLE in recruiters referrals; do
    CSV_FILE="${EXPORT_DIR}/${TABLE}_${TIMESTAMP}.csv"
    log "Exporting ${TABLE} → $(basename "$CSV_FILE")"
    psql "$BACKUP_DATABASE_URL" -c \
        "\\COPY (SELECT * FROM ${TABLE} ORDER BY updated_at DESC) TO STDOUT WITH CSV HEADER" \
        > "$CSV_FILE" 2>>"$LOG_FILE"

    if [ $? -eq 0 ] && [ -s "$CSV_FILE" ]; then
        ROW_COUNT=$(tail -n +2 "$CSV_FILE" | wc -l | tr -d ' ')
        CSV_SIZE=$(stat -c %s "$CSV_FILE" 2>/dev/null || stat -f %z "$CSV_FILE" 2>/dev/null || echo 0)
        log "  ✓ ${TABLE}: ${ROW_COUNT} rows, ${CSV_SIZE} bytes"
        ln -sf "$(basename "$CSV_FILE")" "${EXPORT_DIR}/${TABLE}_latest.csv" 2>/dev/null || true
    else
        log "  WARN: ${TABLE} export produced empty file or failed (non-fatal)"
        rm -f "$CSV_FILE"
    fi
done

# ─── Incremental export for append-only tables ────────────────────────────
# Export only new rows since last backup for large audit/log tables
INCR_DIR="${BACKUP_DIR}/incremental"
mkdir -p "$INCR_DIR"

LAST_BACKUP_TS=""
if [ -f "$STATE_FILE" ]; then
    LAST_BACKUP_TS=$(cat "$STATE_FILE" | grep -o '"last_backup_at": *"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$LAST_BACKUP_TS" ]; then
    for TABLE in audit_logs bounce_logs; do
        INCR_FILE="${INCR_DIR}/${TABLE}_${TIMESTAMP}.csv.gz"
        log "Incremental export: $TABLE (since $LAST_BACKUP_TS)"
        psql "$BACKUP_DATABASE_URL" -c \
            "\\COPY (SELECT * FROM ${TABLE} WHERE created_at > '${LAST_BACKUP_TS}') TO STDOUT WITH CSV HEADER" \
            2>>"$LOG_FILE" | gzip > "$INCR_FILE" || log "WARN: Incremental export of $TABLE failed (non-fatal)"
    done
fi

# ─── Rotation — delete backups older than retention period ─────────────────
log "Rotating backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name "chuchube_*.dump*" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$INCR_DIR" -name "*.csv.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$EXPORT_DIR" -name "*_2*.csv" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

# ─── Create a "latest" symlink ─────────────────────────────────────────────
ln -sf "$(basename "$FINAL_FILE")" "${BACKUP_DIR}/latest.dump" 2>/dev/null || true

# ─── Write final state ────────────────────────────────────────────────────
write_state "success" "$(basename "$FINAL_FILE")" "$FILE_SIZE" "$DURATION" ""

log "=== Backup pipeline complete ==="
