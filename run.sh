#!/bin/bash
# ---------------------------------------------------------------
# run.sh — Docker Compose helper for Email Campaign Manager
#
# Usage:
#   ./run.sh          → build + start (default)
#   ./run.sh start    → start without rebuilding
#   ./run.sh stop     → stop all containers
#   ./run.sh restart  → stop, rebuild, start
#   ./run.sh rebuild  → full clean rebuild (no cache)
#   ./run.sh logs     → follow live logs (Ctrl+C to exit)
#   ./run.sh logs:be  → follow backend logs only
#   ./run.sh migrate  → run Alembic migrations inside the backend
#   ./run.sh status   → show container status
# ---------------------------------------------------------------

set -e

COMPOSE="docker compose"
APP_URL="http://localhost"
API_URL="http://localhost:8000"

print_header() {
  echo ""
  echo "📧  Email Campaign Manager"
  echo "=================================="
}

check_docker() {
  if ! command -v docker &>/dev/null; then
    echo "❌  Docker is not installed. Install it from https://docs.docker.com/get-docker/"
    exit 1
  fi
  if ! docker info &>/dev/null; then
    echo "❌  Docker daemon is not running. Start Docker Desktop and try again."
    exit 1
  fi
}

ensure_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      echo "⚠️   No .env file found — copying .env.example → .env"
      cp .env.example .env
      echo "    Edit .env with your credentials before continuing."
      echo ""
    else
      echo "⚠️   No .env file found. Creating a minimal one..."
      cat > .env <<'EOF'
# --- Clerk Auth ---
CLERK_SECRET_KEY=sk_test_REPLACE_ME
CLERK_JWKS_URL=https://YOUR_INSTANCE.clerk.accounts.dev/.well-known/jwks.json
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME

# --- Database (Supabase PostgreSQL) ---
DATABASE_URL=postgresql://user:pass@host:5432/postgres?sslmode=require

# --- SMTP ---
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
FRONTEND_URL=http://localhost

# --- Senders ---
# SENDER_EMAIL_1=you@gmail.com
# SENDER_PASSWORD_1=your-app-password
EOF
      echo "    Edit .env with your credentials before continuing."
      echo ""
    fi
  fi

  # Validate critical env vars are not placeholders
  local missing=0
  source .env 2>/dev/null || true
  if [[ -z "$CLERK_SECRET_KEY" || "$CLERK_SECRET_KEY" == *"REPLACE_ME"* ]]; then
    echo "⚠️   CLERK_SECRET_KEY not set in .env"
    missing=1
  fi
  if [[ -z "$VITE_CLERK_PUBLISHABLE_KEY" || "$VITE_CLERK_PUBLISHABLE_KEY" == *"REPLACE_ME"* ]]; then
    echo "⚠️   VITE_CLERK_PUBLISHABLE_KEY not set in .env"
    missing=1
  fi
  if [[ -z "$DATABASE_URL" || "$DATABASE_URL" == *"user:pass"* ]]; then
    echo "⚠️   DATABASE_URL not set in .env"
    missing=1
  fi
  if [ "$missing" -eq 1 ]; then
    echo ""
    echo "   Please fill in the missing values in .env and re-run."
    exit 1
  fi
}

run_migrate() {
  echo "🗄️   Running Alembic migrations..."
  $COMPOSE exec backend sh -c "PYTHONPATH=/app alembic upgrade head"
  echo "✅  Migrations applied."
}

cmd="${1:-up}"

print_header
check_docker
ensure_env

case "$cmd" in
  up|"")
    echo "🔨  Building images..."
    $COMPOSE build
    echo ""
    echo "🚀  Starting containers (backend, frontend)..."
    $COMPOSE up -d
    echo ""
    echo "⏳  Waiting for backend to be ready..."
    for i in $(seq 1 30); do
      if curl -sf "$API_URL/api/health" &>/dev/null; then
        break
      fi
      sleep 1
    done
    run_migrate
    echo ""
    echo "✅  All systems go!"
    echo "   App:      $APP_URL"
    echo "   API:      $API_URL"
    echo "   API docs: $API_URL/docs"
    echo ""
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "   Run './run.sh logs' to follow logs."
    echo "   Run './run.sh stop' to shut everything down."
    ;;

  start)
    echo "🚀  Starting containers (no rebuild)..."
    $COMPOSE up -d
    echo ""
    echo "⏳  Waiting for backend..."
    for i in $(seq 1 30); do
      if curl -sf "$API_URL/api/health" &>/dev/null; then
        break
      fi
      sleep 1
    done
    run_migrate
    echo ""
    echo "✅  Running at $APP_URL"
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    ;;

  stop)
    echo "🛑  Stopping containers..."
    $COMPOSE down
    echo "✅  Stopped."
    ;;

  restart)
    echo "🔄  Restarting..."
    $COMPOSE down
    $COMPOSE build
    $COMPOSE up -d
    echo ""
    echo "⏳  Waiting for backend..."
    for i in $(seq 1 30); do
      if curl -sf "$API_URL/api/health" &>/dev/null; then
        break
      fi
      sleep 1
    done
    run_migrate
    echo ""
    echo "✅  Restarted at $APP_URL"
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    ;;

  rebuild)
    echo "🧹  Full clean rebuild (no cache)..."
    $COMPOSE down --remove-orphans
    $COMPOSE build --no-cache
    $COMPOSE up -d
    echo ""
    echo "⏳  Waiting for backend..."
    for i in $(seq 1 30); do
      if curl -sf "$API_URL/api/health" &>/dev/null; then
        break
      fi
      sleep 1
    done
    run_migrate
    echo ""
    echo "✅  Rebuilt and running at $APP_URL"
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    ;;

  logs)
    echo "📋  Following all logs (Ctrl+C to exit)..."
    $COMPOSE logs -f
    ;;

  logs:be)
    echo "📋  Following backend logs (Ctrl+C to exit)..."
    $COMPOSE logs -f backend
    ;;

  migrate)
    run_migrate
    ;;

  status)
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    ;;

  *)
    echo "Unknown command: $1"
    echo "Usage: ./run.sh [up|start|stop|restart|rebuild|logs|logs:be|migrate|status]"
    exit 1
    ;;
esac
