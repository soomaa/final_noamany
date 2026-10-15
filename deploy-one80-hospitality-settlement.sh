#!/usr/bin/env bash
# Code-only hospitality settlement update. No migrations, seeds, or data repairs.
set -Eeuo pipefail
export LC_ALL=C LANG=C
umask 077
APP_DIR="${ONE80_APP_DIR:-/home/alatheertech/one80.alatheertech.com}"
PAYLOAD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/payload"
PM2_NAME="${ONE80_PM2_NAME:-one80}"
PORT_NUM="${ONE80_PORT:-9041}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP="$APP_DIR/backups/hospitality-$STAMP"
BUILD="$(mktemp -d "$APP_DIR/.hospitality-build.XXXXXX")"
DIST_MOVED=0
PUBLIC_MOVED=0
SOURCE_CHANGED=0

rollback() {
  local result=$?
  trap - ERR
  set +e
  if [ "$DIST_MOVED" = 1 ]; then
    rm -rf "$APP_DIR/dist"
    mv "$BACKUP/dist" "$APP_DIR/dist"
  fi
  if [ "$PUBLIC_MOVED" = 1 ]; then
    rm -rf "$APP_DIR/public"
    mv "$BACKUP/public" "$APP_DIR/public"
  fi
  if [ "$SOURCE_CHANGED" = 1 ]; then
    cp -a "$BACKUP/src/." "$APP_DIR/src/"
  fi
  if [ "$DIST_MOVED" = 1 ] || [ "$PUBLIC_MOVED" = 1 ]; then
    pm2 restart "$PM2_NAME"
  fi
  echo "Deployment failed; restored replaced code. Build logs: $BUILD"
  exit "$result"
}
trap rollback ERR

test -d "$APP_DIR/src"
test -d "$APP_DIR/dist"
test -f "$APP_DIR/public/index.html"
test -d "$APP_DIR/node_modules"
test -f "$PAYLOAD_DIR/public/index.html"
pm2 describe "$PM2_NAME" >/dev/null

echo 'Building against the installed server dependencies before changing live code...'
cp -a "$APP_DIR/src" "$BUILD/src"
cp -a "$PAYLOAD_DIR/src/." "$BUILD/src/"
cp "$APP_DIR/package.json" "$APP_DIR/tsconfig.json" "$APP_DIR/tsconfig.build.json" "$APP_DIR/nest-cli.json" "$BUILD/"
ln -s "$APP_DIR/node_modules" "$BUILD/node_modules"
(cd "$BUILD" && npm run build)
test -f "$BUILD/dist/main.js"

# Preserve existing static files and cached assets as well as the new interface.
mkdir -p "$BUILD/public"
cp -a "$APP_DIR/public/." "$BUILD/public/"
cp -a "$PAYLOAD_DIR/public/." "$BUILD/public/"
mkdir -p "$BACKUP"
cp -a "$APP_DIR/src" "$BACKUP/src"
SOURCE_CHANGED=1
cp -a "$PAYLOAD_DIR/src/." "$APP_DIR/src/"
mv "$APP_DIR/dist" "$BACKUP/dist"
DIST_MOVED=1
mv "$BUILD/dist" "$APP_DIR/dist"
mv "$APP_DIR/public" "$BACKUP/public"
PUBLIC_MOVED=1
mv "$BUILD/public" "$APP_DIR/public"
pm2 restart "$PM2_NAME"

READY=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT_NUM/api/health" >/dev/null; then
    READY=1
    break
  fi
  sleep 1
done
test "$READY" = 1
trap - ERR
rm -rf "$BUILD"
echo "Hospitality settlement update deployed. Backup: $BACKUP"
echo 'No database migration or data repair was run.'
