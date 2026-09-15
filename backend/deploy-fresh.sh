#!/usr/bin/env bash
# ============================================================================
# RETIRED destructive demo reset. Never use on Noamany client data.
# Run from the backend folder (where .env and deploy.sh live).
#
#   cd /home/alatheertech/one80.alatheertech.com/backend
#   bash deploy-fresh.sh
#
# WARNING: This DROPS every table in DATABASE_URL and re-seeds demo data.
# Back up first:  bash scripts/backup-db.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "Refusing destructive fresh deploy. Use bash server-deploy.sh for Noamany." >&2
exit 1

if [ ! -f .env ]; then
  echo "!! No .env found. Copy .env.production → .env and fill DATABASE_URL + secrets first."
  exit 1
fi

echo "==> [1/5] Installing dependencies (incl. dev — needed to build & seed)…"
npm install --include=dev

echo "==> [2/5] Generating Prisma client…"
npx prisma generate

echo "==> [3/5] WIPING database and re-applying all migrations (this deletes all data)…"
npx prisma migrate reset --force

echo "==> [4/5] Building backend (dist/)…"
npm run build

echo "==> [5/5] Verifying seed (migrate reset already ran prisma seed)…"
echo "    Demo credentials are not stored in this repository."

echo ""
echo "✅ Fresh deploy complete. Restart the cPanel Node.js app (startup file: dist/main.js)."
