#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="/home/alatheertech/one80.alatheertech.com"
PAYLOAD_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_DIR="$APP_DIR/backups/cafe-product-images-$TIMESTAMP"
HOTFIX_NAME="one80-cafe-image-url-hotfix.js"

echo "==> ONE80 cafe image URL hotfix"
[ -f "$APP_DIR/public/index.html" ] || { echo "Production public/index.html not found" >&2; exit 1; }
[ -f "$APP_DIR/.env" ] || { echo "Production .env not found" >&2; exit 1; }
[ -f "$APP_DIR/package.json" ] || { echo "Production package.json not found" >&2; exit 1; }
[ -f "$PAYLOAD_DIR/$HOTFIX_NAME" ] || { echo "Hotfix JavaScript not found" >&2; exit 1; }
[ -f "$PAYLOAD_DIR/one80-product-image-map.tsv" ] || { echo "Image map not found" >&2; exit 1; }
node --check "$PAYLOAD_DIR/$HOTFIX_NAME"
node --check "$PAYLOAD_DIR/materialize-one80-product-images.mjs"

mkdir -p "$ROLLBACK_DIR"
cp -a "$APP_DIR/public/index.html" "$ROLLBACK_DIR/index.html"
if [ -f "$APP_DIR/public/$HOTFIX_NAME" ]; then
  cp -a "$APP_DIR/public/$HOTFIX_NAME" "$ROLLBACK_DIR/$HOTFIX_NAME"
fi
echo "    rollback=$ROLLBACK_DIR"

echo "==> Installing the isolated UI hotfix"
install -m 0644 "$PAYLOAD_DIR/$HOTFIX_NAME" "$APP_DIR/public/$HOTFIX_NAME"
INDEX_PATH="$APP_DIR/public/index.html" HOTFIX_NAME="$HOTFIX_NAME" node <<'NODE'
const fs = require('node:fs');
const path = process.env.INDEX_PATH;
const filename = process.env.HOTFIX_NAME;
let html = fs.readFileSync(path, 'utf8');
const tag = `<script src="/${filename}?v=20260909b"></script>`;
const existing = new RegExp(`<script[^>]+/${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*></script>`);
if (existing.test(html)) html = html.replace(existing, tag);
else {
  if (!html.includes('</head>')) throw new Error('Cannot find </head> in production index.html');
  html = html.replace('</head>', `  ${tag}\n</head>`);
}
fs.writeFileSync(path, html);
NODE
grep -Fq "/$HOTFIX_NAME" "$APP_DIR/public/index.html"

echo "==> Importing the 100 reviewed images into ONE80 secure storage"
node "$PAYLOAD_DIR/materialize-one80-product-images.mjs" \
  "$APP_DIR" \
  "$PAYLOAD_DIR/one80-product-image-map.tsv" \
  "$ROLLBACK_DIR/cafe-product-images.json"

echo "==> Verifying live site and API"
curl --fail --silent --show-error --output /dev/null "https://one80.alatheertech.com/$HOTFIX_NAME?v=20260909b"
curl --fail --silent --show-error --output /dev/null "https://one80.alatheertech.com/api/health"

echo "✅ ONE80 cafe image hotfix deployed successfully"
echo "   rollback=$ROLLBACK_DIR"
