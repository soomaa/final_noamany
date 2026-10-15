#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — FRESH schema deploy: WIPE database + apply migrations + RBAC + build.
# Run from the backend folder (where .env and deploy.sh live).
#
#   cd /home/alatheertech/one80.alatheertech.com/backend
#   bash deploy-fresh.sh
#
# WARNING: This DROPS every table in DATABASE_URL. It does NOT load demo business data.
# Back up first:  bash scripts/backup-db.sh
# Required acknowledgement: ALLOW_DATABASE_RESET=YES bash deploy-fresh.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

[ "${ALLOW_DATABASE_RESET:-}" = "YES" ] || {
  echo "!! Refusing to wipe the database."
  echo "   After verifying a backup, run: ALLOW_DATABASE_RESET=YES bash deploy-fresh.sh"
  exit 1
}

if [ ! -f .env ]; then
  echo "!! No .env found. Copy .env.production → .env and fill DATABASE_URL + secrets first."
  exit 1
fi

echo "==> [1/5] Installing dependencies (incl. dev — needed to build)…"
npm install --include=dev

echo "==> [2/5] Generating Prisma client…"
npx prisma generate

echo "==> [3/5] WIPING database and re-applying all migrations (this deletes all data)…"
npx prisma migrate reset --force --skip-seed

echo "==> [4/5] Syncing RBAC catalog only…"
npm run db:seed:rbac

echo "==> [5/5] Building backend (dist/)…"
npm run build

echo ""
echo "✅ Fresh deploy complete. Restart the cPanel Node.js app (startup file: dist/main.js)."
echo "   No demo employees, users, members, or cafe rows were seeded."
