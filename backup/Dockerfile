FROM postgres:17-alpine

# Install gpg (encryption) and curl (healthcheck)
# busybox crond is built-in on Alpine; pg_dump comes from the postgres base image
# bash needed for PIPESTATUS support in backup.sh
RUN apk add --no-cache gpg curl jq bash

# Create backup directories
RUN mkdir -p /backups /scripts

# Copy scripts
COPY backup/backup.sh /scripts/backup.sh
COPY backup/restore.sh /scripts/restore.sh
COPY backup/entrypoint.sh /scripts/entrypoint.sh
RUN chmod +x /scripts/*.sh

# Non-root user for running backups (postgres user already exists in base image)
# We run cron as root but the actual pg_dump commands drop to 'postgres' where needed

ENTRYPOINT ["/scripts/entrypoint.sh"]
