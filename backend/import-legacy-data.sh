#!/usr/bin/env bash
# Lossless one-command import for noamanycenter_noamany.sql.
# Raw rows are restored to a separate immutable archive database; canonical
# app tables are populated by audited, idempotent migration scripts.
set -euo pipefail
cd "$(dirname "$0")"

EXPECTED_SHA256='944504425ff3d955d68bb7eb2c140e1394ebd38de507bde3730263c9dd51e8b0'
EXPECTED_TABLES=248
EXPECTED_ROWS=884601
DUMP="${LEGACY_DUMP_PATH:-legacy-import.sql}"
COMMIT=0
SKIP_BACKUP=0
for arg in "$@"; do
  case "$arg" in
    --commit) COMMIT=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    *) echo "!! Unknown option: $arg"; exit 1 ;;
  esac
done
if [ "$COMMIT" -ne 1 ]; then
  echo "Dry safety stop: pass --commit after reviewing the command."
  echo "  bash import-legacy-data.sh --commit"
  exit 2
fi
[ -f "$DUMP" ] || { echo "!! Missing legacy dump: $DUMP"; exit 1; }
[ -f .env ] || { echo "!! Missing .env"; exit 1; }
command -v mysql >/dev/null || { echo "!! mysql client is required"; exit 1; }
command -v mysqldump >/dev/null || { echo "!! mysqldump is required"; exit 1; }
if command -v sha256sum >/dev/null; then
  ACTUAL_SHA="$(sha256sum "$DUMP" | awk '{print $1}')"
elif command -v shasum >/dev/null; then
  ACTUAL_SHA="$(shasum -a 256 "$DUMP" | awk '{print $1}')"
else
  echo "!! sha256sum or shasum is required"; exit 1
fi
[ "$ACTUAL_SHA" = "$EXPECTED_SHA256" ] || {
  echo "!! Dump checksum mismatch. Expected $EXPECTED_SHA256, found $ACTUAL_SHA"; exit 1;
}

URL="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[[ "$URL" == mysql://* ]] || { echo "!! DATABASE_URL must use mysql://"; exit 1; }
rest="${URL#mysql://}"; creds="${rest%%@*}"; hpd="${rest#*@}"
DBU="${creds%%:*}"; DBP_ENC=""; [[ "$creds" == *:* ]] && DBP_ENC="${creds#*:}"
DBN="${hpd##*/}"; DBN="${DBN%%\?*}"
urldecode(){ local d="${1//+/ }"; printf '%b' "${d//%/\\x}"; }
DBP="$(urldecode "$DBP_ENC")"
[[ "$DBN" =~ ^[A-Za-z0-9_$-]+$ ]] || { echo "!! Unsafe target database name"; exit 1; }
[[ "$DBU" =~ ^[A-Za-z0-9_$-]+$ ]] || { echo "!! Unsafe database user"; exit 1; }
ARCHIVE_DB="${LEGACY_DATABASE:-${DBN}_legacy_20260802}"
[[ "$ARCHIVE_DB" =~ ^[A-Za-z0-9_$-]+$ ]] || { echo "!! Unsafe archive database name"; exit 1; }
[ "$ARCHIVE_DB" != "$DBN" ] || { echo "!! Archive and target database names must differ"; exit 1; }

mysql --protocol=socket -e 'SELECT 1' >/dev/null 2>&1 || {
  echo "!! Root MySQL socket access is required for the archive and backup"; exit 1;
}
ROOT_MY=(mysql --protocol=socket)

mkdir -p backups migration-reports
if [ "$SKIP_BACKUP" -eq 0 ]; then
  BACKUP="backups/${DBN}_pre-legacy-import_$(date +%Y%m%d_%H%M%S).sql.gz"
  echo "==> Backing up target database -> $BACKUP"
  mysqldump --protocol=socket --single-transaction --quick --no-tablespaces "$DBN" | gzip > "$BACKUP"
  [ -s "$BACKUP" ] || { echo "!! Target backup is empty"; exit 1; }
fi

ARCHIVE_EXISTS="$("${ROOT_MY[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$ARCHIVE_DB'")"
if [ "$ARCHIVE_EXISTS" = 0 ]; then
  echo "==> Creating immutable archive database '$ARCHIVE_DB'"
  "${ROOT_MY[@]}" -e "CREATE DATABASE \`$ARCHIVE_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  if ! "${ROOT_MY[@]}" --max_allowed_packet=1G --default-character-set=utf8mb4 "$ARCHIVE_DB" < "$DUMP"; then
    echo "!! Archive import failed. The target app database was not modified by canonical migration."
    exit 1
  fi
else
  echo "==> Reusing existing archive database '$ARCHIVE_DB' (never overwritten)"
fi
ARCHIVE_TABLES="$("${ROOT_MY[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$ARCHIVE_DB' AND table_type='BASE TABLE'")"
[ "$ARCHIVE_TABLES" -eq "$EXPECTED_TABLES" ] || {
  echo "!! Archive has $ARCHIVE_TABLES tables; expected $EXPECTED_TABLES. Refusing to continue."; exit 1;
}
ARCHIVE_ROWS=0
while IFS= read -r table; do
  [[ "$table" =~ ^[A-Za-z0-9_$-]+$ ]] || { echo "!! Unsafe table name in archive: $table"; exit 1; }
  rows="$("${ROOT_MY[@]}" -N -B "$ARCHIVE_DB" -e "SELECT COUNT(*) FROM \`$table\`")"
  ARCHIVE_ROWS=$((ARCHIVE_ROWS + rows))
done < <("${ROOT_MY[@]}" -N -B -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$ARCHIVE_DB' AND table_type='BASE TABLE' ORDER BY table_name")
[ "$ARCHIVE_ROWS" -eq "$EXPECTED_ROWS" ] || {
  echo "!! Archive has $ARCHIVE_ROWS rows; expected $EXPECTED_ROWS. Target migration has not started."; exit 1;
}

echo "==> Granting the app read-only access to the archive"
"${ROOT_MY[@]}" <<SQL
GRANT SELECT ON \`$ARCHIVE_DB\`.* TO '$DBU'@'localhost';
GRANT SELECT ON \`$ARCHIVE_DB\`.* TO '$DBU'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

export LEGACY_DATABASE="$ARCHIVE_DB"
export LEGACY_SOURCE_KEY="noamanycenter_noamany:${EXPECTED_SHA256:0:16}"
export LEGACY_DUMP_SHA256="$EXPECTED_SHA256"

echo "==> Applying additive audit schema"
npx prisma migrate deploy
echo "==> Migrating branches, employees and users"
npm run db:migrate:branches
npm run db:validate:branches
npm run db:migrate:employees
npm run db:validate:employees
npm run db:migrate:users
npm run db:validate:users
echo "==> Migrating club, Cafe/POS, inventory, procurement and compatible HR history"
npm run db:migrate:legacy-core
npm run db:migrate:legacy-commerce
npm run db:migrate:legacy-shared
echo "==> Materializing renamed mobile-app, expense and inventory-transfer datasets"
npm run db:migrate:legacy-secondary
echo "==> Materializing remaining HR, member, finance and inventory history"
npm run db:migrate:legacy-gaps
echo "==> Rebuilding the real financial ledger from imported operational documents"
npm run db:rebuild:legacy-finance

REPORT="migration-reports/legacy-migration-$(date +%Y%m%d_%H%M%S).json"
echo "==> Reconciling every table and relationship"
npm run db:validate:legacy-full -- "--report=$REPORT"

echo ""
echo "✅ Legacy import complete and reconciled."
echo "   Archive DB: $ARCHIVE_DB ($ARCHIVE_TABLES tables, $ARCHIVE_ROWS rows; immutable)"
echo "   SHA-256:    $EXPECTED_SHA256"
echo "   Report:     $REPORT"
