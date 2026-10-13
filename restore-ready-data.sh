#!/usr/bin/env bash
# Restore the already-migrated Noamany application database on another machine.
# This script never overwrites a non-empty database.
set -euo pipefail
cd "$(dirname "$0")"

READY_DUMP="${NOAMANY_READY_DUMP:-noamany-ready-data-20260803.sql.gz}"
TARGET_DATABASE="${NOAMANY_TARGET_DATABASE:-noamany_app}"
DATABASE_HOST="${NOAMANY_DATABASE_HOST:-localhost}"
DATABASE_PORT="${NOAMANY_DATABASE_PORT:-3306}"
DATABASE_USER="${NOAMANY_DATABASE_USER:-root}"
DATABASE_PASSWORD="${NOAMANY_DATABASE_PASSWORD:-}"
EXPECTED_SHA256="d9dbd02aa30e3aaf3bc56438563d797a74d69217620b2a52962e4dca0e260930"

[[ "$TARGET_DATABASE" =~ ^[A-Za-z0-9_$-]+$ ]] || {
  echo "Invalid NOAMANY_TARGET_DATABASE: $TARGET_DATABASE" >&2
  exit 1
}
[ -f "$READY_DUMP" ] || {
  echo "Missing ready database dump: $READY_DUMP" >&2
  exit 1
}
command -v mysql >/dev/null || {
  echo "The mysql command-line client is required." >&2
  exit 1
}

if command -v sha256sum >/dev/null; then
  ACTUAL_SHA256="$(sha256sum "$READY_DUMP" | awk '{print $1}')"
else
  ACTUAL_SHA256="$(shasum -a 256 "$READY_DUMP" | awk '{print $1}')"
fi
[ "$ACTUAL_SHA256" = "$EXPECTED_SHA256" ] || {
  echo "Database dump checksum mismatch; refusing to import it." >&2
  exit 1
}

MYSQL_COMMAND=(mysql --host="$DATABASE_HOST" --port="$DATABASE_PORT" --user="$DATABASE_USER")
if [ -n "$DATABASE_PASSWORD" ]; then
  MYSQL_COMMAND+=(--password="$DATABASE_PASSWORD")
fi

"${MYSQL_COMMAND[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
EXISTING_TABLES="$("${MYSQL_COMMAND[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET_DATABASE'")"
[ "$EXISTING_TABLES" -eq 0 ] || {
  echo "Database '$TARGET_DATABASE' already contains $EXISTING_TABLES tables; nothing was overwritten." >&2
  exit 1
}

echo "Restoring the real Noamany data into '$TARGET_DATABASE'..."
gzip -dc "$READY_DUMP" | "${MYSQL_COMMAND[@]}" --default-character-set=utf8mb4 "$TARGET_DATABASE"

COUNTS="$("${MYSQL_COMMAND[@]}" -N -B "$TARGET_DATABASE" -e "
SELECT CONCAT(
  (SELECT COUNT(*) FROM acc_journal_entries),' journals, ',
  (SELECT COUNT(*) FROM fin_revenues),' revenues, ',
  (SELECT COUNT(*) FROM fin_expenses),' expenses, ',
  (SELECT COUNT(*) FROM club_subscriptions WHERE private_package_id IS NOT NULL),' private subscriptions'
)")"
if [ "$COUNTS" != "56296 journals, 49139 revenues, 7171 expenses, 487 private subscriptions" ]; then
  echo "Restore finished, but verification returned: $COUNTS" >&2
  exit 1
fi

echo "Restore verified: $COUNTS"
echo "Set backend/.env DATABASE_URL to database '$TARGET_DATABASE', then start backend and frontend."
