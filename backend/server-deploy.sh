#!/usr/bin/env bash
# Production deploy for the existing Noamany cPanel/Passenger application.
# With an explicit acknowledgement it restores the validated legacy SQL snapshot;
# otherwise it performs a regular non-destructive code/schema update.
set -euo pipefail
cd "$(dirname "$0")"

# cPanel shells can silently fall back to the system Node.js (often Node 10)
# when the configured nodevenv path changes or does not exist. Resolve a
# supported runtime before touching .env or the production database.
use_supported_node() {
  local candidate major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if command -v npm >/dev/null 2>&1 && [ "${major:-0}" -ge 20 ]; then
    return 0
  fi

  for candidate in \
    "${NOAMANY_NODE_BIN:-}" \
    "$HOME/nodevenv/final.noamanycenter.com/22/bin" \
    "$HOME/nodevenv/final.noamanycenter.com/20/bin" \
    "$HOME/nodevenv/noamany-final/22/bin" \
    "$HOME/nodevenv/noamany-final/20/bin" \
    /opt/cpanel/ea-nodejs22/bin \
    /opt/cpanel/ea-nodejs20/bin; do
    [ -n "$candidate" ] || continue
    [ -x "$candidate/node" ] && [ -x "$candidate/npm" ] || continue
    PATH="$candidate:$PATH"
    export PATH
    hash -r
    major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
    [ "${major:-0}" -ge 20 ] && return 0
  done
  return 1
}

use_supported_node || {
  echo "!! Node.js 20 or newer is required before deployment can start."
  echo "   Current runtime: $(node -v 2>/dev/null || echo unavailable)"
  echo "   Configure the cPanel application with Node 20+, or set NOAMANY_NODE_BIN"
  echo "   to the directory containing the supported node and npm executables."
  echo "   No environment file or database operation was performed."
  exit 1
}

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
NPM_MAJOR="$(npm -v | cut -d. -f1)"
[ "$NPM_MAJOR" -ge 9 ] || {
  echo "!! npm 9 or newer is required for package-lock.json v3 (found: $(npm -v))."
  echo "   No environment file or database operation was performed."
  exit 1
}
echo "==> Runtime preflight: node=$(node -v) npm=$(npm -v) node_path=$(command -v node)"

[ -f .env ] || { echo "!! Missing .env in $(pwd)"; exit 1; }
[ -f public/index.html ] || { echo "!! Missing pre-built website at public/index.html"; exit 1; }
[ -f public/system.html ] || { echo "!! Missing pre-built management app at public/system.html"; exit 1; }
[ -f public/.noamany-unified-build ] || {
  echo "!! Unverified public bundle. Run 'npm run build:unified' in the release workspace before packaging."
  exit 1
}
[ -f src/modules/uploads/uploads.module.ts ] || { echo "!! Missing src/modules/uploads/uploads.module.ts — incomplete release archive"; exit 1; }
[ -f src/modules/uploads/uploads.controller.ts ] || { echo "!! Missing src/modules/uploads/uploads.controller.ts — incomplete release archive"; exit 1; }
[ -f src/modules/uploads/uploads.service.ts ] || { echo "!! Missing src/modules/uploads/uploads.service.ts — incomplete release archive"; exit 1; }
grep -q '^DATABASE_URL=' .env || { echo "!! DATABASE_URL is missing from .env"; exit 1; }
grep -q '^NODE_ENV=production' .env || { echo "!! NODE_ENV must be production"; exit 1; }

# Export only DATABASE_URL for the read-only migration preflight. Keep the
# password out of command arguments and logs; the checker passes it via MYSQL_PWD.
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
export DATABASE_URL

if [ "${NOAMANY_RESTORE_MIGRATED_DATA:-}" = "YES" ]; then
  echo "==> Validating the production data snapshot before build or database access..."
  bash scripts/restore-migrated-data.sh --preflight
fi

# cPanel Passenger supplies the listening port. A fixed PORT commonly causes 502 errors.
sed -i 's/^[[:space:]]*PORT=/# PORT=/' .env
chmod 600 .env

echo "==> [1/11] Installing locked build dependencies..."
npm ci --include=dev

echo "==> [2/11] Generating and validating the Prisma client..."
npx prisma generate
npx prisma validate

echo "==> [3/11] Running the read-only migration safety gate..."
npm run prisma:preflight

echo "==> [4/11] Building the backend before any database mutation..."
npm run build

echo "==> [5/11] Backing up the existing production database..."
bash scripts/backup-db.sh

if [ "${NOAMANY_RESTORE_MIGRATED_DATA:-}" = "YES" ]; then
  echo "==> [6/11] Restoring the validated migrated legacy SQL data..."
  bash scripts/restore-migrated-data.sh
else
  echo "==> [6/11] Keeping the current production data (snapshot restore not requested)."
fi

echo "==> [7/11] Preparing the production administrator when requested..."
if [ "${NOAMANY_RESTORE_MIGRATED_DATA:-}" = "YES" ] || [ "${NOAMANY_PREPARE_ADMIN:-}" = "YES" ]; then
  npx tsx prisma/scripts/set-production-admin.ts
else
  echo "    skipped (existing administrator preserved)."
fi

echo "==> [8/11] Reconciling known migration drift..."
bash prisma/scripts/heal-production-migrations.sh

echo "==> [9/11] Applying pending versioned migrations..."
npx prisma migrate deploy

echo "==> [10/11] Synchronizing access-control metadata and checking migrations..."
npm run db:seed:rbac
npx prisma migrate status

echo "==> [11/11] Restarting Passenger..."
mkdir -p tmp
chmod 755 . public dist tmp
find public dist -type d -exec chmod 755 {} +
find public dist -type f -exec chmod 644 {} +
touch tmp/restart.txt

echo
echo "✅ Production deploy completed. No demo seed/reset command was run."
echo "   Passenger startup file: dist/main.js"
echo "   Open: https://final.noamanycenter.com"
