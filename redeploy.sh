#!/usr/bin/env bash
# Rebuild and redeploy both backend and frontend Docker containers
set -e

cd "$(dirname "$0")"

echo "=== Building backend ==="
docker compose build backend

echo ""
echo "=== Building frontend ==="
docker compose build frontend

echo ""
echo "=== Restarting containers ==="
docker compose up -d backend frontend

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
