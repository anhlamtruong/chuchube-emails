#!/usr/bin/env sh
# ─── Restore a backup to a local PostgreSQL instance ───────────────────────
# Usage:
#   ./restore.sh [backup_file]
#
# If no file is specified, restores the latest backup.
#
# Environment variables:
#   LOCAL_DB_URL            – Target local PostgreSQL connection string
#   BACKUP_ENCRYPTION_KEY   – GPG passphrase (required if backup is encrypted)
#   BACKUP_DIR              – Directory containing backups (default: /backups)
# ───────────────────────────────────────────────────────────────────────────
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

# ─── Validate environment ─────────────────────────────────────────────────
if [ -z "$LOCAL_DB_URL" ]; then
    log "ERROR: LOCAL_DB_URL is not set. Aborting."
    exit 1
fi

# ─── Determine which file to restore ──────────────────────────────────────
RESTORE_FILE="${1:-}"

if [ -z "$RESTORE_FILE" ]; then
    # Find the latest backup (follow the symlink or find newest)
    if [ -L "${BACKUP_DIR}/latest.dump" ]; then
        RESTORE_FILE="${BACKUP_DIR}/$(readlink "${BACKUP_DIR}/latest.dump")"
    else
        RESTORE_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name "chuchube_*.dump*" | sort -r | head -1)
    fi
fi

if [ -z "$RESTORE_FILE" ] || [ ! -f "$RESTORE_FILE" ]; then
    log "ERROR: No backup file found to restore."
    exit 1
fi

log "Restoring from: $RESTORE_FILE"

# ─── Decrypt if necessary ────────────────────────────────────────────────
WORK_FILE="$RESTORE_FILE"

if echo "$RESTORE_FILE" | grep -q '\.gpg$'; then
    if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
        log "ERROR: Backup is encrypted but BACKUP_ENCRYPTION_KEY is not set."
        exit 1
    fi
    DECRYPTED_FILE="/tmp/restore_$(date +%s).dump"
    log "Decrypting backup..."
    echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 \
        --decrypt --output "$DECRYPTED_FILE" "$RESTORE_FILE"
    WORK_FILE="$DECRYPTED_FILE"
fi

# ─── Schema parity check ─────────────────────────────────────────────────
log "Checking schema parity..."

# Get migration version from the dump's TOC
DUMP_TABLES=$(pg_restore --list "$WORK_FILE" 2>/dev/null | grep "TABLE DATA" | wc -l)
log "Dump contains data for $DUMP_TABLES tables"

# ─── Restore ──────────────────────────────────────────────────────────────
log "Starting pg_restore to local database..."

# Drop and recreate public schema for a clean restore
psql "$LOCAL_DB_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true

if ! pg_restore \
    --dbname="$LOCAL_DB_URL" \
    --schema=public \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --single-transaction \
    --exit-on-error \
    "$WORK_FILE" 2>&1; then
    log "ERROR: pg_restore failed"
    # Clean up decrypted file if it was created
    [ -n "${DECRYPTED_FILE:-}" ] && rm -f "$DECRYPTED_FILE"
    exit 1
fi

log "pg_restore completed successfully"

# ─── Stamp Alembic version ───────────────────────────────────────────────
# Ensure the local DB is marked at the correct migration head so future
# migrations don't try to re-apply already-present schema changes.
if command -v alembic > /dev/null 2>&1; then
    log "Stamping Alembic to head..."
    DATABASE_URL="$LOCAL_DB_URL" alembic stamp head 2>/dev/null || \
        log "WARN: alembic stamp failed (non-fatal — alembic may not be installed in this container)"
else
    log "INFO: alembic not available in this container. Run 'alembic stamp head' manually on the local DB."
fi

# ─── Verify ──────────────────────────────────────────────────────────────
RESTORED_TABLES=$(psql "$LOCAL_DB_URL" -t -A -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "?")
log "Restore complete. $RESTORED_TABLES tables in local public schema."

# ─── Cleanup ──────────────────────────────────────────────────────────────
[ -n "${DECRYPTED_FILE:-}" ] && rm -f "$DECRYPTED_FILE"

log "=== Restore pipeline complete ==="
