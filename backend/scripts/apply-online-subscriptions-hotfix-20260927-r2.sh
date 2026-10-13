#!/usr/bin/env bash
# Online subscriptions hotfix r2 — drops the stale payment-method foreign key.
#
# The r1 hotfix switched the online flow to settings_payment_methods, but
# online_subscription_requests.payment_method_id is still constrained to
# sales_pos_payment_methods(id). The INSERT therefore fails with MySQL errno 1452,
# which surfaces as HTTP 400 "خطأ في قاعدة البيانات".
#
# Run from /home/noamanycenter/final.noamanycenter.com after extracting the ZIP.
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

SQL_FILE="sql/20260927170000_online_subscription_payment_method_source.sql"
[ -f "$SQL_FILE" ] || { echo "ERROR: Missing $SQL_FILE"; exit 1; }

# ---- locate Node (used only to parse DATABASE_URL) ------------------------------------
NODE_BIN=""
for candidate in \
  /opt/cpanel/ea-nodejs20/bin/node \
  /opt/alt/alt-nodejs20/root/usr/bin/node \
  "$(command -v node20 2>/dev/null || true)" \
  "$(command -v node 2>/dev/null || true)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
done
[ -n "$NODE_BIN" ] || { echo "ERROR: Node.js was not found."; exit 1; }

# ---- read DB credentials from the app's .env -----------------------------------------
# Parsed with Node's URL, not shell string surgery: the cPanel password is
# percent-encoded and may contain @ : / % — all of which break naive splitting.
[ -f .env ] || { echo "ERROR: .env not found in $APP_DIR"; exit 1; }

read_field() {
  "$NODE_BIN" -e '
    const fs = require("fs");
    const line = fs.readFileSync(".env", "utf8")
      .split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (!line) { process.exit(3); }
    const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^["'"'"']|["'"'"']$/g, "");
    const u = new URL(raw);
    const out = {
      user: decodeURIComponent(u.username),
      pass: decodeURIComponent(u.password),
      host: u.hostname,
      port: u.port || "3306",
      name: decodeURIComponent(u.pathname.replace(/^\//, "")),
    };
    process.stdout.write(out[process.argv[1]] ?? "");
  ' "$1"
}

DB_USER="$(read_field user)" || { echo "ERROR: DATABASE_URL is not set in .env"; exit 1; }
DB_PASS="$(read_field pass)"
DB_HOST="$(read_field host)"
DB_PORT="$(read_field port)"
DB_NAME="$(read_field name)"
[ -n "$DB_NAME" ] || { echo "ERROR: could not parse a database name from DATABASE_URL"; exit 1; }

echo "Target database: $DB_NAME @ $DB_HOST:$DB_PORT"

# Pass the password through the environment, never on the command line — argv is
# world-readable in `ps` on a shared cPanel host.
export MYSQL_PWD="$DB_PASS"
MYSQL=(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME")

# ---- 1. back up the affected table ----------------------------------------------------
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/online_subscription_requests-${STAMP}.sql"
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  "$DB_NAME" online_subscription_requests > "$BACKUP"
echo "Backup written: $BACKUP"

# ---- 2. show the constraint before ----------------------------------------------------
echo "--- foreign keys BEFORE ---"
"${MYSQL[@]}" -N -e "
  SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='online_subscription_requests'
    AND REFERENCED_TABLE_NAME IS NOT NULL;"

# ---- 3. apply -------------------------------------------------------------------------
"${MYSQL[@]}" < "$SQL_FILE"

echo "--- foreign keys AFTER ---"
"${MYSQL[@]}" -N -e "
  SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='online_subscription_requests'
    AND REFERENCED_TABLE_NAME IS NOT NULL;"

# ---- 4. mark the migration as applied so future deploys do not re-run it --------------
"${MYSQL[@]}" -e "
  INSERT INTO _prisma_migrations
    (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), REPEAT('0',64), NOW(),
         '20260927170000_online_subscription_payment_method_source',
         NULL, NULL, NOW(), 1
  FROM DUAL
  WHERE NOT EXISTS (
    SELECT 1 FROM _prisma_migrations
    WHERE migration_name='20260927170000_online_subscription_payment_method_source'
  );" 2>/dev/null || echo "NOTE: could not touch _prisma_migrations (safe to ignore if the table is absent)."

mkdir -p tmp
touch tmp/restart.txt

echo
echo "SUCCESS: fk_online_subscription_payment_method removed."
echo "Restart requested through: $APP_DIR/tmp/restart.txt"
