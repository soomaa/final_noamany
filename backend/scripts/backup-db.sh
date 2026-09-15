#!/usr/bin/env bash
# ============================================================================
# ONE80 Gym — MySQL backup with rotation.
# Reads DATABASE_URL from ../.env, dumps the DB gzipped to ./backups, and keeps
# the most recent $KEEP files. Money data — run this on a schedule (see DEPLOY.md).
#
#   Manual:  bash scripts/backup-db.sh
#   Cron  :  0 2 * * *  cd /path/to/backend && bash scripts/backup-db.sh >> backups/backup.log 2>&1
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="${BACKUP_KEEP:-14}"                 # how many dumps to retain
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"

[ -f .env ] || { echo "!! .env not found (need DATABASE_URL)"; exit 1; }
URL="$(grep -E '^DATABASE_URL' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[ -n "$URL" ] || { echo "!! DATABASE_URL empty"; exit 1; }

# Parse mysql://user:pass@host:port/db  (pass and port optional)
proto_removed="${URL#mysql://}"
creds="${proto_removed%%@*}"
hostportdb="${proto_removed#*@}"
USER="${creds%%:*}"
PASS=""; [[ "$creds" == *:* ]] && PASS="${creds#*:}"
hostport="${hostportdb%%/*}"
DB="${hostportdb##*/}"; DB="${DB%%\?*}"
HOST="${hostport%%:*}"
PORT="3306"; [[ "$hostport" == *:* ]] && PORT="${hostport#*:}"

TS="$(date +%Y%m%d_%H%M%S)"
FILE="$OUT_DIR/${DB}_${TS}.sql.gz"
TMP_FILE="$FILE.partial"
trap 'rm -f "$TMP_FILE"' EXIT

echo "==> Backing up '$DB' on $HOST:$PORT -> $FILE"
DUMP_ARGS=(-h "$HOST" -P "$PORT" -u "$USER" --single-transaction --quick --no-tablespaces --triggers "$DB")
if [ -n "$PASS" ]; then
  MYSQL_PWD="$PASS" mysqldump "${DUMP_ARGS[@]}" | gzip > "$TMP_FILE"
else
  mysqldump "${DUMP_ARGS[@]}" | gzip > "$TMP_FILE"
fi
gzip -t "$TMP_FILE"
[ -s "$TMP_FILE" ] || { echo "!! Backup output is empty; refusing to continue."; exit 1; }
mv "$TMP_FILE" "$FILE"
trap - EXIT

SIZE="$(du -h "$FILE" | cut -f1)"
echo "==> Done ($SIZE)."

# Rotate: keep newest $KEEP
COUNT="$(ls -1t "$OUT_DIR"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$OUT_DIR"/*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
  echo "==> Rotated: kept newest $KEEP of $COUNT."
fi
echo "✅ Backup complete. Restore with:  gunzip < $FILE | mysql -h HOST -u USER -p DBNAME"
