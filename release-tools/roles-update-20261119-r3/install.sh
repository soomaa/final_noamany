#!/usr/bin/env bash
# Noamany roles update 2026-11-19-r3 (database only, on top of 19-r2).
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-roles-update-20261119-r3.zip
#   bash noamany-roles-update-20261119-r3/install.sh
# Applies 20261118150000_seven_roles_and_sales_toggle: the club's roles (ادمن، مدير فرع، مديرة فرع، ريسبشن،
# بار، كابتن، عامل خدمات، أخصائي مبيعات) by job title / section; unused roles and job titles removed.
# Safety gates, checked right after the SQL; if any fails the tables are restored from the backup taken just before:
#   - no active account loses any permission it had (role allows + allow exceptions);
#   - active accounts without a role do not increase; active super admins do not decrease.
# Backup = only the 10 tables involved (users, employees, department_jobs, rbac_*), gzip.
set -Eeuo pipefail
REL=20261119-r3
MIG=20261118150000_seven_roles_and_sales_toggle
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
DB="${DB:-noamanycenter_nest}"
TEST_MODE="${TEST_MODE:-0}"
TABLES="users employees department_jobs rbac_roles rbac_user_roles rbac_role_permissions rbac_role_scopes rbac_user_exceptions rbac_resources rbac_actions"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
sql() { mysql --default-character-set=utf8mb4 "$DB" "$@"; }
val() { sql -N -B < "$PKG/sql/summary.sql" | awk -v k="$1" '$1==k{print $2}'; }
health_ok() {
  local body
  body=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e 'const b=JSON.parse(process.argv[1]);process.exit(b.status==="ok"&&b.app==="Noamany HR API"&&Math.abs(Date.now()-Date.parse(b.ts))<180000?0:1)' "$body" 2>/dev/null
}
three_health() { local i ok=0; for i in $(seq 1 60); do if health_ok; then ok=$((ok+1)); [ $ok -ge 3 ] && return 0; else ok=0; fi; sleep 3; done; return 1; }
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
restart_and_check() {
  local before; before=$(app_pids)
  touch tmp/restart.txt; [ "$(id -u)" = 0 ] && chown "$(stat -c '%U:%G' dist/main.js 2>/dev/null || stat -f '%Su:%Sg' dist/main.js)" tmp/restart.txt || true
  for _ in $(seq 1 80); do now=$(app_pids); [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ] && break; sleep 3; done
  three_health
}

say "=== Noamany update $REL (roles) ==="
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch (incomplete upload?)"
LOCK="$APP/tmp/noamany-update.lock"; mkdir -p "$APP/tmp"
mkdir "$LOCK" 2>/dev/null || die "another install is running or crashed ($LOCK exists)"
trap 'rmdir "$LOCK" 2>/dev/null || true; sql -e "DROP TABLE IF EXISTS _r3_eff_before, _r3_eff_after" 2>/dev/null || true' EXIT

say "--- 1) preflight (no changes yet)"
sql -N -e "SELECT 1" >/dev/null || die "cannot reach MySQL database $DB"
[ "$(sql -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$DB' AND table_name='employees' AND column_name='is_sales'")" = 1 ] || die "employees.is_sales missing — install 19-r1 first"
[ "$(sql -N -e "SELECT COUNT(*) FROM rbac_roles WHERE \`key\`='additional_sales'")" = 1 ] || die "additional_sales role missing — install 19-r1 first"
[ "$(sql -N -e "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='$MIG'")" = 0 ] || die "$MIG is already recorded as applied"
FREE_KB=$(df -Pk "$APP" | awk 'NR==2{print $4}'); [ "$FREE_KB" -gt 1048576 ] || die "less than 1 GB free disk"
three_health || die "API is not healthy before the update"
B_NOROLE=$(val approved_without_role); B_ADMINS=$(val super_admin_accounts); B_ROLES=$(val roles); B_JOBS=$(val job_titles)
say "OK: before — roles $B_ROLES, job titles $B_JOBS, active accounts without a role $B_NOROLE, active super admins $B_ADMINS"

say "--- 2) backup (the 10 tables this update touches)"
BACKUP=$(mktemp -d "$APP/tmp/nov19-r3-roles-backup.XXXXXX")
# shellcheck disable=SC2086
mysqldump --default-character-set=utf8mb4 --single-transaction --skip-triggers --set-gtid-purged=OFF --no-tablespaces "$DB" $TABLES | gzip -c > "$BACKUP/tables.sql.gz"
gzip -t "$BACKUP/tables.sql.gz" || die "backup is corrupt"
[ "$(gzip -dc "$BACKUP/tables.sql.gz" | grep -cE '^INSERT INTO `(users|rbac_user_roles|rbac_role_permissions)`' | tr -d ' ')" -ge 3 ] || die "backup has no rows"
echo "$REL" > "$BACKUP/RELEASE"
say "OK: backup $BACKUP/tables.sql.gz ($(du -h "$BACKUP/tables.sql.gz" | cut -f1))"
restore() {
  say "!! restoring the 10 tables from $BACKUP"
  gzip -dc "$BACKUP/tables.sql.gz" | sql && say "RESTORED: roles and permissions are exactly as before the update." || say "!! restore failed — run: gunzip < $BACKUP/tables.sql.gz | mysql $DB"
}

say "--- 3) apply roles migration"
MAIN_PID=$$
on_error() {
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  restore; say "INSTALL FAILED: $REL — something failed after the tables were touched, so the change was undone."; exit 1
}
trap on_error ERR
sed 's/@SNAP@/_r3_eff_before/g' "$PKG/sql/snapshot.sql" | sql
sql < "$PKG/sql/01-seven-roles.sql"
sed 's/@SNAP@/_r3_eff_after/g' "$PKG/sql/snapshot.sql" | sql
LOSING=$(sql -N -B < "$PKG/sql/compare.sql" | awk '$1=="users_losing"{print $2}')
CELLS=$(sql -N -B < "$PKG/sql/compare.sql" | awk '$1=="cells_lost"{print $2}')
GAINING=$(sql -N -B < "$PKG/sql/compare.sql" | awk '$1=="users_gaining"{print $2}')
A_NOROLE=$(val approved_without_role); A_ADMINS=$(val super_admin_accounts); A_ROLES=$(val roles); A_JOBS=$(val job_titles)
say "after — roles $A_ROLES, job titles $A_JOBS, active accounts without a role $A_NOROLE, active super admins $A_ADMINS"
say "permissions — accounts losing any: $LOSING ($CELLS cells), accounts gaining: $GAINING"
if [ "$LOSING" != 0 ] || [ "$A_NOROLE" -gt "$B_NOROLE" ] || [ "$A_ADMINS" -lt "$B_ADMINS" ]; then
  restore; say "INSTALL FAILED: $REL — a safety check failed, so the change was undone."; exit 1
fi
sql -e "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        SELECT UUID(), '$(sha256sum "$PKG/sql/01-seven-roles.sql" | cut -d' ' -f1)', NOW(3), '$MIG', NULL, NULL, NOW(3), 1
        WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '$MIG')"
trap - ERR
say "OK: roles updated and every safety check passed"

say "--- 4) restart (fresh permission caches)"
if restart_and_check; then say "OK: three healthy API responses after restart"; else
  say "!! API not healthy after restart — restoring"; restore; restart_and_check || true; say "INSTALL FAILED: $REL"; exit 1; fi

say
say "UPDATE VERIFIED: 2026-11-19-r3; roles $B_ROLES → $A_ROLES, job titles $B_JOBS → $A_JOBS, without a role $B_NOROLE → $A_NOROLE; nobody lost a permission."
say "backup: $BACKUP/tables.sql.gz"
say "undo (soon after only — later edits to users/roles would be lost): bash $PKG/rollback.sh $BACKUP"
