#!/usr/bin/env bash
# Deprecated legacy deploy entrypoint. Use server-deploy.sh for Noamany.
# Run from app root:  bash go-live.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "This legacy deploy command is retired. Use: bash server-deploy.sh" >&2
exit 1

[ -f .env ] || { echo "!! Missing .env — create it first."; exit 1; }
grep -q 'DATABASE_URL' .env || { echo "!! .env has no DATABASE_URL — it's the wrong/old format. Replace it."; exit 1; }
# Passenger injects its own PORT; a hardcoded one causes 502/hang. Neutralise it.
sed -i 's/^[[:space:]]*PORT=/#PORT=/' .env 2>/dev/null || true
[ -f dist/main.js ] || echo "    (dist/main.js not found yet — will build)"
[ -d src/modules/uploads ] || { echo "!! Missing src/modules/uploads — re-upload the fixed zip."; exit 1; }
[ -f public/index.html ] || { echo "!! Missing public/index.html — re-upload the zip with frontend build."; exit 1; }

echo "==> [1/6] npm install…"
npm install --include=dev

echo "==> [2/6] Prisma generate…"
npx prisma generate

echo "==> [3/6] Fix invalid zero dates (safe if already fixed)…"
npx prisma db execute --stdin <<'SQL' || true
UPDATE club_customer_sources SET updated_at = NOW(3) WHERE updated_at < '1971-01-01';
UPDATE club_event_categories SET updated_at = NOW(3) WHERE updated_at < '1971-01-01';
UPDATE club_membership_types SET updated_at = NOW(3) WHERE updated_at < '1971-01-01';
UPDATE club_subscription_types SET updated_at = NOW(3) WHERE updated_at < '1971-01-01';
UPDATE club_locker_subscription_types SET updated_at = NOW(3) WHERE updated_at < '1971-01-01';
SQL

echo "==> [4/6] Build…"
npm run build

echo "==> [5/6] Secure folder…"
rm -f one80-deploy.zip
mkdir -p uploads tmp
chmod 755 . public dist tmp uploads 2>/dev/null || true
find public dist -type d -exec chmod 755 {} + 2>/dev/null || true
find public dist -type f -exec chmod 644 {} + 2>/dev/null || true

echo "==> [6/6] Restart Passenger…"
touch tmp/restart.txt

if ! grep -q 'PassengerAppRoot' .htaccess 2>/dev/null; then
  echo ""
  echo "⚠️  .htaccess has NO Passenger config — Apache cannot run Node."
  echo "   Fix in cPanel → Setup Node.js App:"
  echo "     Root: $(pwd)"
  echo "     Startup file: dist/main.js"
  echo "   Then click SAVE and RESTART (cPanel rewrites .htaccess)."
  echo "   Do NOT add only 'Options -Indexes' — that causes 403 Forbidden."
fi

echo ""
echo "✅ Go-live complete."
echo "   Open the configured Noamany production domain."
echo "   Credentials are delivered separately through the approved secret channel."
echo "   If you still see a file list → cPanel → Node.js App → Restart (startup: dist/main.js)"
