#!/usr/bin/env sh
# ─── Backup Container Entrypoint ──────────────────────────────────────────
# Installs the cron schedule and starts crond in the foreground.
#
# Environment variables:
#   BACKUP_CRON – Cron expression (default: "0 3 * * *" → daily at 3 AM UTC)
# ───────────────────────────────────────────────────────────────────────────
set -e

BACKUP_CRON="${BACKUP_CRON:-0 3 * * *}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOG_FILE="${BACKUP_DIR}/backup.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup container starting"
echo "  Schedule: ${BACKUP_CRON}"
echo "  Retention: ${BACKUP_RETENTION_DAYS:-7} days"
echo "  Encryption: $([ -n "$BACKUP_ENCRYPTION_KEY" ] && echo 'enabled' || echo 'disabled')"

mkdir -p "$BACKUP_DIR"

# ─── Build the cron environment file ──────────────────────────────────────
# Cron starts with a minimal environment, so we dump all relevant vars
# into a file that the backup script sources.
ENV_FILE="/scripts/backup_env.sh"
cat > "$ENV_FILE" <<EOF
export BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL}"
export LOCAL_DB_URL="${LOCAL_DB_URL:-}"
export BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
export BACKUP_DIR="${BACKUP_DIR}"
export PATH="/usr/local/bin:/usr/bin:/bin"
EOF
chmod 600 "$ENV_FILE"

# ─── Write the crontab ────────────────────────────────────────────────────
CRON_LINE="${BACKUP_CRON} . /scripts/backup_env.sh && /scripts/backup.sh >> ${LOG_FILE} 2>&1"
echo "$CRON_LINE" > /etc/crontabs/root

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Cron installed: ${CRON_LINE}"

# ─── Run an initial backup on first start if no backups exist ─────────────
if [ -z "$(find "$BACKUP_DIR" -maxdepth 1 -name 'chuchube_*.dump*' 2>/dev/null | head -1)" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No existing backups found — running initial backup"
    . "$ENV_FILE"
    /scripts/backup.sh || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WARN: Initial backup failed (will retry on schedule)"
fi

# ─── Watch for manual trigger file ────────────────────────────────────────
# The admin API can create /backups/.trigger to request an immediate backup.
# We check for it every 30 seconds in the background.
(
    while true; do
        if [ -f "${BACKUP_DIR}/.trigger" ]; then
            rm -f "${BACKUP_DIR}/.trigger"
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Manual trigger detected — running backup"
            . "$ENV_FILE"
            /scripts/backup.sh >> "$LOG_FILE" 2>&1 || true
        fi
        sleep 30
    done
) &

# ─── Start cron in the foreground ─────────────────────────────────────────
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting crond"
exec /usr/sbin/crond -f -l 2
