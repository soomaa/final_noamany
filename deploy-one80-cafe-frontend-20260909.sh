#!/usr/bin/env bash
set -Eeuo pipefail
export LC_ALL=C LANG=C

APP_ROOT="/home/alatheertech/one80.alatheertech.com"
PAYLOAD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
NEXT_PUBLIC="$APP_ROOT/public.next-$RELEASE_ID"
BACKUP_DIR="$APP_ROOT/backups/cafe-frontend-$RELEASE_ID"
SWAPPED=0

restore_on_error() {
  if [ "$SWAPPED" -eq 1 ] && [ ! -d "$APP_ROOT/public" ] && [ -d "$BACKUP_DIR/public" ]; then
    mv "$BACKUP_DIR/public" "$APP_ROOT/public"
  fi
  rm -rf "$NEXT_PUBLIC"
}
trap restore_on_error ERR

echo "==> ONE80 cafe frontend update"
[ -f "$APP_ROOT/public/index.html" ] || { echo "Current frontend not found" >&2; exit 1; }
[ -f "$PAYLOAD_DIR/public/index.html" ] || { echo "Packaged frontend not found" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" "$NEXT_PUBLIC"
cp -a "$PAYLOAD_DIR/public/." "$NEXT_PUBLIC/"
[ -d "$NEXT_PUBLIC/assets" ] || { echo "Packaged assets are missing" >&2; exit 1; }

mv "$APP_ROOT/public" "$BACKUP_DIR/public"
SWAPPED=1
mv "$NEXT_PUBLIC" "$APP_ROOT/public"
SWAPPED=0

curl -fsS --max-time 20 https://one80.alatheertech.com/ >/dev/null
echo "✅ ONE80 cafe search and image saving frontend deployed"
echo "   rollback=$BACKUP_DIR/public"
echo "   database=unchanged"
