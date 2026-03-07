#!/usr/bin/env bash
# Rebuild and redeploy both backend and frontend Docker containers
set -e

cd "$(dirname "$0")"

echo "=== Building & starting all containers ==="
docker compose up -d --build

echo ""
echo "=== Running database migrations ==="
docker compose exec backend alembic upgrade head

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
echo "=== Container status ==="
docker compose ps

echo ""
echo "=== Done! ==="
