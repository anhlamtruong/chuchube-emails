#!/usr/bin/env bash
# run.sh — convenience wrapper for common dev/deploy tasks
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<EOF
Usage: ./run.sh <command>

Commands:
  dev           Start backend + frontend for local development
  build         Build Docker images
  up            Start all services (docker compose up -d)
  down          Stop all services
  logs          Tail logs for all services
  migrate       Run Alembic migrations (head)
  lint          Run frontend lint + typecheck
  test          Run backend tests (pytest)
  shell         Open a bash shell in the backend container

EOF
  exit 1
}

[[ $# -lt 1 ]] && usage

case "$1" in
  dev)
    echo "→ Starting backend (uvicorn) + frontend (vite) …"
    trap 'kill 0' EXIT
    (cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
    (cd frontend && npm run dev) &
    wait
    ;;
  build)
    docker compose build "${@:2}"
    ;;
  up)
    docker compose up -d "${@:2}"
    ;;
  down)
    docker compose down "${@:2}"
    ;;
  logs)
    docker compose logs -f "${@:2}"
    ;;
  migrate)
    echo "→ Running Alembic migrations …"
    (cd backend && alembic upgrade head)
    ;;
  lint)
    echo "→ Frontend lint + typecheck …"
    (cd frontend && npx tsc --noEmit && npx eslint .)
    ;;
  test)
    echo "→ Running backend tests …"
    (cd backend && python -m pytest -x -q "${@:2}")
    ;;
  shell)
    docker compose exec backend bash
    ;;
  *)
    echo "Unknown command: $1"
    usage
    ;;
esac
