#!/usr/bin/env bash
# Build frontend + backend and create one80-deploy.zip for cPanel upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/one80-deploy.zip"
STAGE="$ROOT/.release-staging"

echo "==> Cleaning staging…"
rm -rf "$STAGE"
mkdir -p "$STAGE"

echo "==> Building frontend…"
(cd "$ROOT/frontend" && npm install && npm run build)

echo "==> Building backend…"
(cd "$ROOT/backend" && npm install --include=dev && npx prisma generate && npm run build)

echo "==> Staging release files…"
rsync -a \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'backups' \
  --exclude '/uploads' \
  --exclude '.git' \
  "$ROOT/backend/" "$STAGE/"

rm -rf "$STAGE/public"/*
cp -r "$ROOT/frontend/dist/"* "$STAGE/public/"

echo "==> Creating $OUT …"
rm -f "$OUT"
(cd "$STAGE" && zip -r "$OUT" . -x "*.DS_Store")

rm -rf "$STAGE"
echo "✅ Done: $OUT"
echo "   Upload to server, unzip into your app folder, configure .env, then: bash deploy-fresh.sh"
