#!/usr/bin/env bash
# Rebuild and redeploy both backend and frontend Docker containers
set -e

cd "$(dirname "$0")"

echo "=== Graceful drain: signalling backend to stop accepting work ==="
docker compose stop -t 10 backend 2>/dev/null || true
echo "  Backend stopped gracefully"

echo "=== Building all images ==="
docker compose build

echo ""
echo "=== Running database migrations (before starting backend) ==="
# Run migrations in a one-off container so the app doesn't start until schema is ready
docker compose run --rm --no-deps backend alembic upgrade head && \
  echo "  ✓ Migrations applied" || \
  echo "  ⚠ Migration failed — check logs above"

echo ""
echo "=== Starting all containers ==="
docker compose up -d

echo ""
echo "=== Pulling Ollama model (background) ==="
docker compose exec -d ollama ollama pull deepseek-r1:1.5b
echo "  (model pull running in background)"

echo ""
echo "=== Waiting for backend startup ==="
sleep 5

echo "=== Health check ==="
curl -sf http://localhost:8000/api/health && echo " ✓ Backend OK" || echo " ✗ Backend failed"

echo ""
echo "=== Backup container status ==="
if docker compose ps backup --format '{{.Status}}' 2>/dev/null | grep -q 'Up'; then
    echo "  ✓ Backup container running"
else
    echo "  ⚠ Backup container not running (check BACKUP_DATABASE_URL in .env)"
fi

echo ""
echo "=== Container status ==="
docker compose ps

echo ""
echo "=== Done! ==="
