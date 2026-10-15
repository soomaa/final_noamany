#!/usr/bin/env bash
# ONE80 code-only deployment.
#
# This script intentionally does not run mysql, mysqldump, Prisma migrations,
# Prisma db push, seeds, or any data maintenance command. Before changing code,
# it performs a read-only migration-status check and refuses to deploy if the
# packaged Prisma schema is not already compatible with the server database.
set -euo pipefail

cd "$(dirname "$0")"
APP_DIR="$(pwd)"
SHARED_ROOT="${ONE80_SHARED_DIR:-$(dirname "$APP_DIR")/one80-shared}"
PM2_NAME="${ONE80_PM2_NAME:-one80}"
PORT_NUM="${ONE80_PORT:-9041}"

echo "==> ONE80 strict code-only deployment"
echo "    No database command or migration will be run."

[ -f .env ] || {
  echo "!! Existing server .env is missing. Nothing was changed."
  exit 1
}
[ -f package.json ] || { echo "!! package.json is missing."; exit 1; }
[ -f package-lock.json ] || { echo "!! package-lock.json is missing."; exit 1; }
[ -f prisma/schema.prisma ] || { echo "!! prisma/schema.prisma is missing."; exit 1; }
[ -f public/index.html ] || { echo "!! packaged frontend is missing."; exit 1; }
[ -f server-clean-build.sh ] || { echo "!! server-clean-build.sh is missing."; exit 1; }

command -v node >/dev/null || { echo "!! node is not installed."; exit 1; }
command -v npm >/dev/null || { echo "!! npm is not installed."; exit 1; }
command -v pm2 >/dev/null || { echo "!! pm2 is not installed."; exit 1; }

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$NODE_MAJOR" -ge 20 ] || {
  echo "!! Node.js 20 or newer is required (found $(node -v))."
  exit 1
}

# Prevent the exact failure mode where new application code is restarted while
# its required database columns are still pending. This reads migration status
# only; it never applies or resolves a migration.
[ -x node_modules/.bin/prisma ] || {
  echo "!! Existing Prisma CLI is unavailable for the compatibility preflight."
  echo "   Use: bash server-deploy.sh"
  exit 1
}
echo "==> Checking database compatibility (read-only)…"
if ! MIGRATION_STATUS="$(npx --no-install prisma migrate status 2>&1)"; then
  printf '%s\n' "$MIGRATION_STATUS"
  echo "!! Code-only deploy refused: migration history is not up to date."
  echo "   Use 'bash server-deploy.sh' to back up the DB and apply required schema migrations safely."
  exit 1
fi
printf '%s\n' "$MIGRATION_STATUS"

echo "==> Installing locked dependencies…"
npm ci --include=dev

echo "==> Generating Prisma client locally (no database connection)…"
npx prisma generate

echo "==> Clean backend build with rollback…"
bash "$APP_DIR/server-clean-build.sh" "$APP_DIR" "$SHARED_ROOT"

echo "==> Restarting PM2 process '$PM2_NAME'…"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  PORT="$PORT_NUM" NODE_ENV=production pm2 restart "$PM2_NAME" --update-env
else
  PORT="$PORT_NUM" NODE_ENV=production pm2 start dist/main.js --name "$PM2_NAME" --time
fi
pm2 save >/dev/null 2>&1 || true

echo "==> Waiting for health check…"
READY=0
for _ in $(seq 1 30); do
  if curl --fail --silent -o /dev/null "http://127.0.0.1:$PORT_NUM/api/health"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != 1 ]; then
  echo "!! Application did not become healthy. Database data was not modified by this deploy script."
  pm2 logs "$PM2_NAME" --lines 40 --nostream || true
  exit 1
fi

echo "✅ Code deployed. Server .env, uploads, backups, and database were not changed."
