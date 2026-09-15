#!/usr/bin/env bash
# Restore the fully migrated/validated legacy SQL snapshot into production.
# Must only be called after scripts/backup-db.sh succeeds.
set -euo pipefail
cd "$(dirname "$0")/.."

SNAPSHOT="database/noamany-migrated-data-20260805.sql.gz"
EXPECTED_SHA256="f49f4730c86222be16bbd99e0b3deb31d31cc5edf7bc625f9a758f1047d61ccc"
REQUIRED_ACK="REPLACE_PRODUCTION_WITH_VALIDATED_884601_SQL_ROWS"

[ "${NOAMANY_DATA_RESTORE_ACK:-}" = "$REQUIRED_ACK" ] || {
  echo "!! Data restore confirmation is missing."
  echo "   Set NOAMANY_DATA_RESTORE_ACK=$REQUIRED_ACK"
  exit 1
}
[ -f .env ] || { echo "!! Missing .env"; exit 1; }
[ -f "$SNAPSHOT" ] || { echo "!! Missing $SNAPSHOT"; exit 1; }

if command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum "$SNAPSHOT" | awk '{print $1}')"
else
  actual_sha="$(shasum -a 256 "$SNAPSHOT" | awk '{print $1}')"
fi
[ "$actual_sha" = "$EXPECTED_SHA256" ] || {
  echo "!! Snapshot checksum mismatch; refusing to restore."
  exit 1
}
gzip -t "$SNAPSHOT"

url="$(grep -E '^DATABASE_URL=' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[ -n "$url" ] || { echo "!! DATABASE_URL is empty"; exit 1; }
rest="${url#mysql://}"
creds="${rest%%@*}"
host_path="${rest#*@}"
db_user="${creds%%:*}"
db_pass_encoded=""
[[ "$creds" == *:* ]] && db_pass_encoded="${creds#*:}"
host_port="${host_path%%/*}"
db_name="${host_path##*/}"
db_name="${db_name%%\?*}"
db_host="${host_port%%:*}"
db_port="3306"
[[ "$host_port" == *:* ]] && db_port="${host_port#*:}"

url_decode() {
  local decoded="${1//+/ }"
  printf '%b' "${decoded//%/\\x}"
}
db_pass="$(url_decode "$db_pass_encoded")"

[ "$db_name" = "noamanycenter_nest" ] || {
  echo "!! Refusing to replace unexpected database: $db_name"
  exit 1
}

if [ "${1:-}" = "--preflight" ]; then
  echo "✅ Snapshot preflight passed: checksum, gzip integrity, target database and acknowledgement are valid."
  exit 0
fi
[ $# -eq 0 ] || { echo "!! Unknown option: $1"; exit 1; }

mysql_cmd=(mysql -h "$db_host" -P "$db_port" -u "$db_user" --default-character-set=utf8mb4 "$db_name")

echo "==> Restoring validated migrated data into '$db_name'..."
MYSQL_PWD="$db_pass" gunzip -c "$SNAPSHOT" | MYSQL_PWD="$db_pass" "${mysql_cmd[@]}"

read -r source_rows members subscriptions receipts trainers errors <<<"$(
  MYSQL_PWD="$db_pass" "${mysql_cmd[@]}" -N -e "
    SELECT
      (SELECT source_row_count FROM legacy_import_runs WHERE status='complete' ORDER BY id DESC LIMIT 1),
      (SELECT COUNT(*) FROM legacy_record_mappings WHERE legacy_table='tbl_members' AND target_table='club_members'),
      (SELECT COUNT(*) FROM legacy_record_mappings WHERE legacy_table='tbl_subscription_members' AND target_table='club_subscriptions'),
      (SELECT COUNT(*) FROM legacy_record_mappings WHERE legacy_table='tbl_subscription_members' AND target_table='club_receipts'),
      (SELECT COUNT(*) FROM legacy_record_mappings WHERE legacy_table='tbl_captains' AND target_table='club_trainers'),
      (SELECT COALESCE(SUM(error_rows),0) FROM legacy_table_reconciliations);
  "
)"

[ "$source_rows" = "884601" ] || { echo "!! Restore validation failed: source rows=$source_rows"; exit 1; }
[ "$members" = "50486" ] || { echo "!! Restore validation failed: members=$members"; exit 1; }
[ "$subscriptions" = "34044" ] || { echo "!! Restore validation failed: subscriptions=$subscriptions"; exit 1; }
[ "$receipts" = "33071" ] || { echo "!! Restore validation failed: receipts=$receipts"; exit 1; }
[ "$trainers" = "18" ] || { echo "!! Restore validation failed: trainers=$trainers"; exit 1; }
[ "$errors" = "0" ] || { echo "!! Restore validation failed: reconciliation errors=$errors"; exit 1; }

echo "✅ Migrated SQL data restored and verified: 884,601 source rows, zero reconciliation errors."
