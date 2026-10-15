#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — build the deployable one80-deploy.zip on your Mac (run local).
#
#   bash make-release.sh              → DATA-FREE zip (default, safe).
#                                        No DB dump, no data files, no server
#                                        secrets. The normal server deployment
#                                        backs up the DB and applies only the
#                                        required versioned schema migrations.
#   bash make-release.sh --with-db  → also bundle a fresh DB dump + Excel data
#                                        + import-data.sh (only when you really
#                                        intend to push data to the server).
#   bash make-release.sh --include-env → explicitly bundle deploy.env as .env
#                                        (first install only; updates should preserve
#                                        the server's existing .env).
#
# Then upload the zip to the server and run:
#   unzip -o one80-deploy.zip && bash server-deploy.sh
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
STAGE="$ROOT/.release-stage"
OUT="$ROOT/one80-deploy.zip"
WITH_DB=0
INCLUDE_ENV=0
for arg in "$@"; do
  case "$arg" in
    --with-db) WITH_DB=1 ;;
    --include-env) INCLUDE_ENV=1 ;;
    *) echo "!! Unknown option: $arg"; exit 1 ;;
  esac
done
LOCAL_DB="${LOCAL_DB:-one80_hr}"
DB_HOST="${DB_HOST:-127.0.0.1}"; DB_USER="${DB_USER:-root}"

echo "==> Mode: $([ $WITH_DB = 1 ] && echo 'WITH DATA (dump + import bundle)' || echo 'DATA-FREE RELEASE (no DB dump, safe)')"

echo "==> Build frontend…"
( cd "$ROOT/frontend" && npm ci && npm run build )

echo "==> Stage backend (anchored excludes)…"
rm -rf "$STAGE"; mkdir -p "$STAGE"
rsync -a \
  --exclude 'node_modules' --exclude '.env' --exclude '.env.*' \
  --exclude '/dist' --exclude '/backups' --exclude '/uploads' \
  --exclude '/private-uploads' --exclude '/database' --exclude '/data' \
  --exclude '/prisma/.migrations-archive-predeploy' \
  --exclude '/prisma/portable-migrations' --exclude '/prisma/sql' \
  --exclude '/prisma/scripts/deleted-no-phone-members-backup.json' \
  --exclude '*.zip' --exclude '*.log' \
  --exclude '.git' --exclude '.DS_Store' \
  "$ROOT/backend/" "$STAGE/"
mkdir -p "$STAGE/public"; rm -rf "$STAGE/public"/*; cp -r "$ROOT/frontend/dist/"* "$STAGE/public/"

echo "==> Add deployment scripts…"
cp "$ROOT/server-deploy.sh"  "$STAGE/server-deploy.sh"; chmod +x "$STAGE/server-deploy.sh"
cp "$ROOT/server-code-only-deploy.sh" "$STAGE/server-code-only-deploy.sh"; chmod +x "$STAGE/server-code-only-deploy.sh"
cp "$ROOT/server-clean-build.sh" "$STAGE/server-clean-build.sh"; chmod +x "$STAGE/server-clean-build.sh"
mkdir -p "$STAGE/docs"
cp "$ROOT/docs/APP_MANAGEMENT_API.md" "$STAGE/docs/APP_MANAGEMENT_API.md"
cp "$ROOT/docs/FLUTTER_MEMBER_API.md" "$STAGE/docs/FLUTTER_MEMBER_API.md"
if [ "$INCLUDE_ENV" = 1 ]; then
  [ -f "$ROOT/deploy.env" ] || { echo "!! deploy.env missing"; exit 1; }
  cp "$ROOT/deploy.env" "$STAGE/.env"
  echo "    ⚠ bundled .env (first-install mode). Keep the ZIP private."
else
  echo "    preserving server .env (not included in the release)."
fi

if [ "$WITH_DB" = 1 ]; then
  echo "==> Dump + sanitize local DB '$LOCAL_DB'…"
  mysqldump -u "$DB_USER" -h "$DB_HOST" --single-transaction --quick --no-tablespaces \
    --set-gtid-purged=OFF --skip-add-locks --add-drop-table --default-character-set=utf8mb4 "$LOCAL_DB" \
    | sed -E 's/utf8mb4_0900_(ai_ci|as_ci|as_cs)/utf8mb4_unicode_ci/g; s/ DEFINER=`[^`]*`@`[^`]*`//g' > "$STAGE/db-import.sql"
  grep -q 'GTID_PURGED' "$STAGE/db-import.sql" && { echo "!! dump still has GTID_PURGED — aborting"; exit 1; } || true
  echo "    db-import.sql: $(du -h "$STAGE/db-import.sql" | cut -f1)"
  if [ -f "$ROOT/import-data.sh" ]; then
    cp "$ROOT/import-data.sh" "$STAGE/import-data.sh"; chmod +x "$STAGE/import-data.sh"
    mkdir -p "$STAGE/data"
    for x in 2.xlsx games.xlsx; do [ -f "$ROOT/data/$x" ] && cp "$ROOT/data/$x" "$STAGE/data/$x"; done
    echo "    bundled import-data.sh + data/*.xlsx"
  fi
fi

echo "==> Zip…"
rm -f "$OUT"; ( cd "$STAGE" && zip -rqX "$OUT" . -x "*.DS_Store" ); rm -rf "$STAGE"
if [ "$WITH_DB" = 0 ] && [ "$INCLUDE_ENV" = 0 ]; then
  node "$ROOT/code-only-release-gate.mjs" "$OUT"
fi
echo "✅ $OUT ($(du -h "$OUT" | cut -f1))"
echo "   Upload it, then on the server:"
echo "     cd /home/alatheertech/one80.alatheertech.com && unzip -o one80-deploy.zip && bash server-deploy.sh"
echo "   Default server deployment backs up the DB, applies required migrations, and never wipes/imports business data."
echo "   Strict no-DB alternative (refuses to deploy if migrations are pending):"
echo "     bash server-code-only-deploy.sh"
echo "   One-time production preparation (keeps cafe + packages/prices):"
echo "     bash server-deploy.sh --prepare-production"
echo "   The server must already have a valid .env (use --include-env only for first install)."
