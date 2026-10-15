#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — production-safe deploy for cPanel (run from the backend app root).
#   1) install deps  2) generate Prisma client  3) apply migrations
#   4) sync RBAC catalog  5) build
#
# Business/demo seed data is NEVER loaded by this script.
# Prerequisite: a ".env" file exists here with a valid DATABASE_URL (see .env.production).
# After it finishes, (re)start the cPanel Node app with startup file: dist/main.js
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "!! No .env found. Copy .env.production to .env and fill DATABASE_URL + domain first."
  exit 1
fi

echo "==> [1/5] Installing dependencies (incl. dev — needed to build)…"
npm install --include=dev

echo "==> [2/5] Generating Prisma client…"
npx prisma generate

echo "==> [3/5] Applying database schema via versioned migrations…"
# Use migrate deploy (safe, reviewed, versioned) instead of `db push --accept-data-loss`
# so a schema drift can never silently DROP a column/table and lose money data.
# NOTE for an EXISTING DB first switched onto migrations: run once, before this line,
#   npx prisma migrate resolve --applied 00000000000000_baseline
# to baseline it without recreating tables (see DEPLOY.md). Fresh DBs need nothing extra.
npx prisma migrate deploy

echo "==> [4/5] Syncing RBAC catalog and job-title roles (no business data)…"
npm run db:seed:rbac

echo "==> [5/5] Building backend (dist/)…"
npm run build

echo ""
echo "✅ Deploy complete. Now (re)start the cPanel Node.js app (startup file: dist/main.js)."
echo "   Production data was preserved; no demo seed was executed."
