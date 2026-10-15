#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — safe full deploy from project root (frontend + backend).
#
#   cd /home/alatheertech/one80.alatheertech.com
#   bash deploy.sh
#
# Requires backend/.env with DATABASE_URL, JWT secrets, CORS_ORIGINS.
# Preserves the production database. Data cleanup is a separate guarded command.
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if [ ! -d "$BACKEND" ]; then
  echo "!! backend/ not found. Run from the project root or use backend/deploy-fresh.sh"
  exit 1
fi

if [ -f "$BACKEND/scripts/backup-db.sh" ] && [ -f "$BACKEND/.env" ]; then
  echo "==> Optional pre-deploy backup…"
  (cd "$BACKEND" && bash scripts/backup-db.sh) || echo "    (backup skipped — continuing)"
fi

if [ -f "$FRONTEND/package.json" ]; then
  echo "==> Building frontend…"
  (cd "$FRONTEND" && npm install && npm run build)
  echo "==> Copying frontend/dist → backend/public/…"
  rm -rf "$BACKEND/public"/*
  cp -r "$FRONTEND/dist/"* "$BACKEND/public/"
else
  echo "==> No frontend/ folder — using existing backend/public/ build."
fi

echo "==> Running safe backend deploy…"
bash "$BACKEND/deploy.sh"
