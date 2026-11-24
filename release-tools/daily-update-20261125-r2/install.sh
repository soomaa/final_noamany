#!/usr/bin/env bash
# Noamany update 2026-11-25-r2 (on top of 24-r7, verified installed 24 Nov).
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261125-r2.zip
#   bash noamany-daily-update-20261125-r2/install.sh
#
# Everything done and not yet uploaded: the prepared-but-never-installed 25-r1 (entry check by branch group,
# attendance WhatsApp/branch filter, reception InBody, dashboard order, «حذف (اتعمل بالغلط)», one visit per
# member per day) + the HR work of 24/25 Nov (daily exceptions page and reminders, per-weekday shift times,
# fingerprint-confirmed overtime, comp days, approval chain manager → HR → department manager with return
# with comment, manager overtime through HR, HR inbox, employee exit types, «إعدادات الحضور والمرتبات»,
# Excel punch import through the engine, offline punch review, HR screens pass).
#   - SQL 01–09: new tables (all accessed with raw SQL), new columns on tbl_emps_hours_edafi /
#     hr_all_agzat_orders / hr_overtime_requests, RBAC rows; each recorded in _prisma_migrations.
#   - Prisma Client and prisma/schema.prisma: NOT changed. main.js untouched.
#   - Backend: compiled files changed + new; the server's hand-edited files are not in this release, except
#     attendance.module.js / attendance-device-agent.service.js (server copies from the 24 Nov fingerprint
#     install + this release's additions; their current server fingerprints are checked first).
#   - Management UI: system.html + new assets.
# Everything is checked before anything changes; a failure after that restores the files automatically.
# The full database dump made in step 5 is kept for a manual restore.
set -Eeuo pipefail
REL=20261125-r2
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
DB="${DB:-noamanycenter_nest}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
NEW_TABLES="tbl_hdodr_setting_day_overrides hr_comp_day_credits hr_attendance_exception_resolutions hr_overtime_requests hr_employee_exits hr_payroll_settings hr_request_timeline hr_request_returns hr_attendance_exception_reminders attendance_offline_punch_reviews"

say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
owner_of() { stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"; }
run_timeout() { if command -v timeout >/dev/null; then timeout "$@"; else shift; "$@"; fi; }
sql() { mysql --default-character-set=utf8mb4 "$DB" "$@"; }
sql1() { sql -N -B -e "$1"; }
health_ok() {
  local body
  body=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e '
    const b = JSON.parse(process.argv[1]);
    const age = Math.abs(Date.now() - Date.parse(b.ts));
    process.exit(b.status === "ok" && b.app === "Noamany HR API" && age < 180000 ? 0 : 1);
  ' "$body" 2>/dev/null
}
three_health() {
  local i ok=0
  for i in $(seq 1 60); do
    if health_ok; then ok=$((ok + 1)); [ "$ok" -ge 3 ] && return 0; else ok=0; fi
    sleep 3
  done
  return 1
}
# root's PM2 runs the app; a root cron job restarts it within ~1 minute of tmp/restart.txt appearing.
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
wait_restart() {
  local before="$1" i now
  for i in $(seq 1 80); do
    now=$(app_pids)
    if [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ]; then return 0; fi
    sleep 3
  done
  return 1
}
put() { # put <package file> <live path>: write via temp + rename, keep owner, verify
  mkdir -p "$(dirname "$2")"
  cp "$1" "$2.r2502tmp"
  mv -f "$2.r2502tmp" "$2"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$2"
  chmod 664 "$2"
  [ "$(sha "$2")" = "$(sha "$1")" ] || { say "!! $2 was not written correctly"; return 1; }
}

say "=== Noamany update $REL ==="
say "app: $APP   package: $PKG   database: $DB"

say "--- 1) package integrity"
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch (incomplete upload?)"
say "OK: all package files match PACKAGE-SHA256SUMS"

say "--- 2) single install lock"
LOCK="$APP/tmp/noamany-update.lock"
mkdir -p "$APP/tmp"
mkdir "$LOCK" 2>/dev/null || die "another install is running or crashed ($LOCK exists). Make sure no install is running, then delete that folder."
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

say "--- 3) preflight (no changes yet)"
grep -q "PassengerAppRoot \"$APP\"" .htaccess || die ".htaccess PassengerAppRoot is not $APP"
grep -q 'PassengerStartupFile "dist/main.js"' .htaccess || die "Passenger does not start dist/main.js"
OWNER=$(owner_of dist/main.js)
say "file owner: $OWNER"
[ "$(sha prisma/schema.prisma)" = "$(cat "$PKG/expected/schema.sha256")" ] || die "prisma/schema.prisma is not 24-r7's production schema"
[ "$(sha node_modules/.prisma/client/index.js)" = "$(cat "$PKG/expected/client-index.sha256")" ] || die "the live Prisma Client is not 24-r7's"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not 24-r7's (the UI changed since)"
while read -r rel exp; do
  [ -f "dist/$rel" ] || die "missing dist/$rel"
  [ "$(norm "dist/$rel")" = "$exp" ] || die "dist/$rel differs from the 24-r7 baseline (changed on the server?)"
done < "$PKG/expected/backend-baseline.txt"
while read -r rel; do
  [ ! -e "dist/$rel" ] || die "dist/$rel already exists (unexpected)"
done < "$PKG/expected/backend-new.txt"
say "OK: schema, Client, management HTML and $(wc -l < "$PKG/expected/backend-baseline.txt" | tr -d ' ') backend files match 24-r7"
CONFLICT=0
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then
    say "!! public/$rel exists with different content"; CONFLICT=1
  fi
done < "$PKG/expected/assets.txt"
[ "$CONFLICT" = 0 ] || die "asset name collision"
say "OK: $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, no collisions"
sql1 "SELECT 1" >/dev/null || die "cannot reach MySQL database $DB as $(id -un)"
grep -qE "^DATABASE_URL=.*/$DB([?\"]|$)" .env || die ".env DATABASE_URL does not point at $DB"
for t in $NEW_TABLES; do
  [ "$(sql1 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_name='$t'")" = 0 ] \
    || die "table $t already exists — this update (or part of it) was applied before"
done
[ "$(sql1 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_name='attendance_device_punches'")" = 1 ] \
  || die "attendance_device_punches is missing (the 24 Nov fingerprint install is expected to be on the server)"
[ "$(sql1 "SELECT COUNT(*) FROM rbac_resources WHERE \`key\` IN ('attendance', 'payroll')")" = 2 ] || die "RBAC catalog rows this update hangs onto (attendance, payroll) are missing"
say "OK: database $DB has none of this update's tables yet"
FREE_KB=$(df -Pk "$APP" | awk 'NR==2{print $4}')
[ "$FREE_KB" -gt 4194304 ] || die "less than 4 GB free disk (the database dump needs room)"
three_health || die "API is not healthy before the update"
say "OK: API healthy before the update"

say "--- 4) staged check (live files are not touched)"
STAGE=$(mktemp -d "$APP/tmp/nov25-r2-stage.XXXXXX")
cp -a dist "$STAGE/dist"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do mkdir -p "$STAGE/$(dirname "$f")"; cp "$PKG/payload/$f" "$STAGE/$f"; done
CHANGED=$(cut -d' ' -f1 "$PKG/expected/backend-baseline.txt"; cat "$PKG/expected/backend-new.txt")
# shellcheck disable=SC2086
run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" $CHANGED >"$STAGE/new-check.log" 2>&1 \
  || { tail -30 "$STAGE/new-check.log"; die "new backend fails the Nest dependency check with the live Client"; }
tail -1 "$STAGE/new-check.log"
rm -rf "$STAGE"

say "--- 5) backup (files + full database dump)"
BACKUP=$(mktemp -d "$APP/tmp/nov25-r2-update-backup.XXXXXX")
mkdir -p "$BACKUP/files"
: > "$BACKUP/MANIFEST"
backup_file() {
  local rel="$1"
  [ -f "$rel" ] || return 0
  mkdir -p "$BACKUP/files/$(dirname "$rel")"
  cp -p "$rel" "$BACKUP/files/$rel"
  echo "$(sha "$BACKUP/files/$rel") $rel" >> "$BACKUP/MANIFEST"
}
while read -r rel _; do backup_file "dist/$rel"; backup_file "dist/$rel.map"; done < "$PKG/expected/backend-baseline.txt"
backup_file public/system.html
while read -r rel; do echo "dist/$rel"; echo "dist/$rel.map"; done < "$PKG/expected/backend-new.txt" > "$BACKUP/NEW-BACKEND-FILES"
echo "$REL" > "$BACKUP/RELEASE"
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "file backup verification failed"
say "OK: files backed up ($(wc -l < "$BACKUP/MANIFEST" | tr -d ' '))"
mysqldump --default-character-set=utf8mb4 --single-transaction --quick --routines --set-gtid-purged=OFF --no-tablespaces "$DB" \
  | gzip -c > "$BACKUP/database.sql.gz" || die "database dump failed"
gzip -t "$BACKUP/database.sql.gz" || die "database dump is corrupt"
DUMP_ROWS=$(gzip -dc "$BACKUP/database.sql.gz" | grep -oE '^INSERT INTO `(club_members|club_subscriptions)`' | sort | uniq -c | wc -l | tr -d ' ')
[ "$DUMP_ROWS" = 2 ] || die "database dump has no member/subscription rows — refusing to continue"
say "OK: database dump $BACKUP/database.sql.gz ($(du -h "$BACKUP/database.sql.gz" | cut -f1), members and subscriptions present)"
UNDO="bash $PKG/rollback.sh $BACKUP"

# ---------------------------------------------------------------------------
# From here on, any failure restores the files automatically.
MAIN_PID=$$
auto_rollback() {
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  say "!! failure after changes started — restoring the backup automatically"
  if bash "$PKG/rollback.sh" "$BACKUP" --auto; then
    say "ROLLBACK DONE: the server is back on 24-r7. Send this log."
  else
    say "!! automatic rollback did not finish. Run: $UNDO"
  fi
  exit 1
}
trap auto_rollback ERR

say "--- 6a) database changes"
echo applied > "$BACKUP/SQL-STARTED"
for f in "$PKG"/sql/0*.sql; do
  sql < "$f" >/dev/null
  name=$(basename "$f" .sql); name=${name#*-}
  sql1 "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        SELECT UUID(), '$(sha "$f")', NOW(3), '$name', NULL, NULL, NOW(3), 1
        WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '$name')"
  say "OK: $(basename "$f")"
done
for t in $NEW_TABLES; do
  [ "$(sql1 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_name='$t'")" = 1 ]
done
[ "$(sql1 "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$DB' AND table_name='tbl_emps_hours_edafi' AND column_name IN ('requested_hours','confirmed_minutes')")" = 2 ]
[ "$(sql1 "SELECT COUNT(*) FROM rbac_resources WHERE \`key\` IN ('attendance.exceptions','payroll.attendance_settings')")" = 2 ]
say "OK: database changes applied (tracking of daily cases starts $(sql1 "SELECT setting_value FROM hr_payroll_settings WHERE setting_key='exceptionsTrackingStartDate'"))"

say "--- 6b) files (assets → backend → management HTML)"
PIDS_BEFORE=$(app_pids)
while read -r rel; do
  [ -e "public/$rel" ] && continue
  put "$PKG/payload/public/$rel" "public/$rel"
done < "$PKG/expected/assets.txt"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do put "$PKG/payload/$f" "$f" || exit 1; done
put "$PKG/payload/public/system.html" public/system.html
say "OK: files written and verified"

say "--- 7) restart (PM2 via the restart-on-request cron, up to ~1 minute)"
touch tmp/restart.txt; [ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
wait_restart "$PIDS_BEFORE" || { say "!! the app process was not restarted (still: $(app_pids)); is the restart cron running?"; false; }
three_health || { say "!! API did not become healthy after restart"; false; }
say "OK: three healthy API responses after restart (processes: ${PIDS_BEFORE:-?} → $(app_pids))"

say "--- 8) post-install checks"
for p in /login /dashboard /attendance/exceptions /hr/payroll-settings /requests/inbox /attendance/offline-review; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new management HTML"; false; }
done
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")" = 200 ] || { say "!! $a not served"; false; }
done
for p in attendance/exceptions attendance/exceptions/pending-summary hr/payroll-settings overtime-requests requests/inbox termination/exits attendance/offline-punches club-subscriptions; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/$p")
  [ "$code" = 401 ] || { say "!! unauthenticated GET /api/$p returned $code (expected 401)"; false; }
done
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST "$SITE/api/attendance/device-agent/punches")
[ "$code" = 401 ] || [ "$code" = 403 ] || [ "$code" = 400 ] || { say "!! fingerprint agent endpoint returned $code"; false; }
grep -q PeriodSummaryModule dist/app.module.js || { say "!! 24-r6 period summary module missing"; false; }
grep -q AttendanceExceptionsModule dist/app.module.js || { say "!! daily exceptions module not registered"; false; }
say "OK: new HTML on 6 routes, all entry assets 200, 8 API routes 401, fingerprint agent endpoint answers, modules in place"
trap - ERR
say
say "UPDATE VERIFIED: 2026-11-25-r2; database, backend and management UI updated; API healthy."
say "backup: $BACKUP"
say "undo files (keeps the database): $UNDO"
say "full database restore (only if really needed; loses everything written after the update):"
say "  gunzip < $BACKUP/database.sql.gz | mysql $DB"
