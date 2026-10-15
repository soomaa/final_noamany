#!/usr/bin/env bash
# Build metacoffee-deploy.zip for cPanel upload (code-only; server keeps .env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CAFFE="$ROOT"
STAGE="$(cd "$ROOT/.." && pwd)/.metacoffee-stage"
OUT="$(cd "$ROOT/.." && pwd)/metacoffee-deploy.zip"

echo "==> Build frontend…"
( cd "$CAFFE/frontend" && npm run build )

echo "==> Stage backend (anchored excludes — do not exclude src/modules/uploads)…"
rm -rf "$STAGE"
mkdir -p "$STAGE/public"
rsync -a \
  --exclude 'node_modules' --exclude '.env' --exclude '.env.production' \
  --exclude '/uploads' --exclude '/backups' --exclude '/tmp' \
  --exclude '/dist' --exclude '*.zip' --exclude '*.log' \
  --exclude '.git' --exclude '.DS_Store' \
  "$CAFFE/backend/" "$STAGE/"
rm -rf "$STAGE/public"/* && cp -r "$CAFFE/frontend/dist/"* "$STAGE/public/"

echo "==> Install + build in stage…"
( cd "$STAGE" && npm install --include=dev && npx prisma generate && npm run build )

echo "==> Zip (exclude node_modules)…"
rm -f "$OUT"
( cd "$STAGE" && zip -rqX "$OUT" . -x "node_modules/*" -x "*.DS_Store" -x ".env" -x ".env.*" )
rm -rf "$STAGE"

echo ""
echo "✅ $OUT"
ls -lh "$OUT"
unzip -l "$OUT" | grep -E 'dist/main.js|public/index.html|src/modules/uploads/uploads.module' | head -5
