#!/usr/bin/env bash
# Noamany full update 2026-11-19-r1 installer (on top of 18-r1, verified installed 18 Nov).
#   cd /home/noamanycenter/final.noamanycenter.com
#   unzip -o noamany-full-update-20261119-r1.zip
#   bash noamany-full-update-20261119-r1/install.sh
#
# Unlike a daily update this one changes the database and the Prisma Client:
#   - SQL: freeze days + package offers; employees.is_sales + the additional_sales role (NOT the
#     role/job-title reshuffle); sales management + WhatsApp campaign tables.
#   - Prisma Client: generated from the server's own schema + exactly those additions, with the
#     production compatibility exports carried over (main.js and its enum aliases untouched).
#   - Backend: changed/new compiled files and app.module.js (5 new modules).
#   - Management UI: system.html + new assets.
#   - No data cleanup: production already has the right stores/bars (checked 19 Nov).
# Everything is checked before anything changes; a failure after that restores the files and the
# Client automatically. The full database dump made in step 5 is kept for a manual restore.
set -Eeuo pipefail
REL=20261119-r1
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
DB="${DB:-noamanycenter_nest}"
TEST_MODE="${TEST_MODE:-0}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"

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
# root's PM2 runs the app ("noamany-final"); a root cron job restarts it within ~1 minute of
# tmp/restart.txt appearing.
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
restart_app() {
  mkdir -p tmp
  touch tmp/restart.txt
  [ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
}
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
  cp "$1" "$2.r1901tmp"
  mv -f "$2.r1901tmp" "$2"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$2"
  chmod 664 "$2"
  [ "$(sha "$2")" = "$(sha "$1")" ] || { say "!! $2 was not written correctly"; return 1; }
}

# ---------------------------------------------------------------------------
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
if [ "$TEST_MODE" != 1 ]; then
  grep -q "PassengerAppRoot \"$APP\"" .htaccess || die ".htaccess PassengerAppRoot is not $APP"
  grep -q 'PassengerStartupFile "dist/main.js"' .htaccess || die "Passenger does not start dist/main.js"
fi
OWNER=$(owner_of dist/main.js)
say "file owner: $OWNER"
[ "$(sha prisma/schema.prisma)" = "$(cat "$PKG/expected/schema.sha256")" ] || die "prisma/schema.prisma is not the reviewed production schema"
[ "$(sha node_modules/.prisma/client/index.js)" = "$(cat "$PKG/expected/client-index.sha256")" ] || die "the live Prisma Client is not the reviewed one"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not 18-r1's (the UI changed since)"
[ "$(norm dist/app.module.js)" = "$(cat "$PKG/expected/app.module.sha256")" ] || die "dist/app.module.js is not the reviewed production copy"
while read -r rel exp; do
  [ -f "dist/$rel" ] || die "missing dist/$rel"
  [ "$(norm "dist/$rel")" = "$exp" ] || die "dist/$rel differs from the 18-r1 baseline (changed on the server?)"
done < "$PKG/expected/backend-baseline.txt"
while read -r rel; do
  [ ! -e "dist/$rel" ] || die "dist/$rel already exists (unexpected)"
done < "$PKG/expected/backend-new.txt"
say "OK: schema, Client, management HTML, app.module and $(wc -l < "$PKG/expected/backend-baseline.txt" | tr -d ' ') backend files match 18-r1"
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
for t in wa_campaigns club_sales_rep_settings club_lead_comments; do
  [ "$(sql1 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_name='$t'")" = 0 ] \
    || die "table $t already exists — this update (or part of it) was applied before"
done
for c in club_subscription_types.freeze_total_days club_subscription_types.promo_enabled employees.is_sales club_leads.assigned_at club_lead_follow_ups.author_name; do
  [ "$(sql1 "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$DB' AND table_name='${c%%.*}' AND column_name='${c#*.}'")" = 0 ] \
    || die "column $c already exists — this update (or part of it) was applied before"
done
LEADS=$(sql1 "SELECT COUNT(*) FROM club_leads WHERE CHAR_LENGTH(status) > 20")
[ "$LEADS" = 0 ] || die "$LEADS potential members have a status longer than 20 characters (the new column is 20)"
say "OK: database $DB has none of this update's tables/columns yet"
FREE_KB=$(df -Pk "$APP" | awk 'NR==2{print $4}')
[ "$FREE_KB" -gt 4194304 ] || die "less than 4 GB free disk (the database dump needs room)"
three_health || die "API is not healthy before the update"
say "OK: API healthy before the update"

say "--- 4) staged check (live files are not touched)"
STAGE=$(mktemp -d "$APP/tmp/nov19-r1-stage.XXXXXX")
cp -a dist "$STAGE/dist"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do mkdir -p "$STAGE/$(dirname "$f")"; cp "$PKG/payload/$f" "$STAGE/$f"; done
mkdir -p "$STAGE/node_modules/@prisma" "$STAGE/node_modules/.prisma"
cp -a node_modules/@prisma/client "$STAGE/node_modules/@prisma/client"
cp -a "$PKG/payload/prisma-client" "$STAGE/node_modules/.prisma/client"
node -e '
  const c = require(process.argv[1]);
  const models = c.Prisma.dmmf.datamodel.models;
  const need = ["wa_campaigns", "club_sales_rep_settings", "club_lead_comments", "legacy_gym_source_records"];
  const miss = need.filter((n) => !models.some((m) => m.name === n));
  const compat = ["QuickSaleStatus", "InventoryTxnType", "YesNo", "BrCode"].filter((n) => !c[n]);
  if (models.length !== Number(process.argv[2]) || miss.length || compat.length) {
    console.error("staged Client wrong:", models.length, miss, compat); process.exit(1);
  }
  console.log("staged Client:", models.length, "models, compatibility exports present");
' "$STAGE/node_modules/.prisma/client" "$(cat "$PKG/expected/client-models.txt")" || die "the new Prisma Client does not load"
CHANGED=$(cut -d' ' -f1 "$PKG/expected/backend-baseline.txt"; cat "$PKG/expected/backend-new.txt")
# shellcheck disable=SC2086
run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" app.module.js $CHANGED >"$STAGE/new-check.log" 2>&1 \
  || { tail -30 "$STAGE/new-check.log"; die "new backend + new Client fail the Nest dependency check"; }
tail -1 "$STAGE/new-check.log"
rm -rf "$STAGE"

say "--- 5) backup (files, Prisma Client, full database dump)"
BACKUP=$(mktemp -d "$APP/tmp/nov19-r1-update-backup.XXXXXX")
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
backup_file dist/app.module.js; backup_file dist/app.module.js.map
backup_file public/system.html
backup_file prisma/schema.prisma
while read -r rel; do echo "dist/$rel"; echo "dist/$rel.map"; done < "$PKG/expected/backend-new.txt" > "$BACKUP/NEW-BACKEND-FILES"
cp -a node_modules/.prisma/client "$BACKUP/prisma-client"
[ "$(sha "$BACKUP/prisma-client/index.js")" = "$(cat "$PKG/expected/client-index.sha256")" ] || die "Client backup is not a faithful copy"
echo "$REL" > "$BACKUP/RELEASE"
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "file backup verification failed"
say "OK: files ($(wc -l < "$BACKUP/MANIFEST" | tr -d ' ')) and Prisma Client backed up"
mysqldump --default-character-set=utf8mb4 --single-transaction --quick --routines --set-gtid-purged=OFF --no-tablespaces "$DB" \
  | gzip -c > "$BACKUP/database.sql.gz" || die "database dump failed"
gzip -t "$BACKUP/database.sql.gz" || die "database dump is corrupt"
DUMP_ROWS=$(gzip -dc "$BACKUP/database.sql.gz" | grep -oE '^INSERT INTO `(club_members|club_subscriptions)`' | sort | uniq -c | wc -l | tr -d ' ')
[ "$DUMP_ROWS" = 2 ] || die "database dump has no member/subscription rows — refusing to continue"
say "OK: database dump $BACKUP/database.sql.gz ($(du -h "$BACKUP/database.sql.gz" | cut -f1), members and subscriptions present)"
UNDO="bash $PKG/rollback.sh $BACKUP"

# ---------------------------------------------------------------------------
# From here on, any failure restores the files and the Client automatically.
MAIN_PID=$$
auto_rollback() {
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  say "!! failure after changes started — restoring the backup automatically"
  if bash "$PKG/rollback.sh" "$BACKUP" --auto; then
    say "ROLLBACK DONE: the server is back on 18-r1. Send this log."
  else
    say "!! automatic rollback did not finish. Run: $UNDO"
  fi
  exit 1
}
trap auto_rollback ERR

say "--- 6a) database changes"
echo applied > "$BACKUP/SQL-STARTED"
for f in "$PKG"/sql/0*.sql; do
  sql < "$f"
  say "OK: $(basename "$f")"
done
# Keep Prisma's migration history in step with what was applied (the roles reshuffle is not).
for m in 20261118120000_freeze_total_days_and_package_offers:01-freeze-days-and-offers.sql \
         20261119120000_sales_management_and_whatsapp:03-sales-management-and-whatsapp.sql; do
  name=${m%%:*}; file=${m#*:}
  sql1 "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        SELECT UUID(), '$(sha "$PKG/sql/$file")', NOW(3), '$name', NULL, NULL, NOW(3), 1
        WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '$name')"
done
for t in wa_campaigns club_sales_rep_settings club_lead_comments; do
  [ "$(sql1 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_name='$t'")" = 1 ]
done
[ "$(sql1 "SELECT COUNT(*) FROM rbac_roles WHERE \`key\` = 'additional_sales'")" = 1 ]
say "OK: database changes applied"

say "--- 6b) files (Client → schema → assets → backend → management HTML)"
PIDS_BEFORE=$(app_pids)
rm -rf node_modules/.prisma/client.r1901new
cp -a "$PKG/payload/prisma-client" node_modules/.prisma/client.r1901new
[ "$(id -u)" = 0 ] && chown -R "$OWNER" node_modules/.prisma/client.r1901new
mv node_modules/.prisma/client node_modules/.prisma/client.r1901old
mv node_modules/.prisma/client.r1901new node_modules/.prisma/client
rm -rf node_modules/.prisma/client.r1901old
[ "$(sha node_modules/.prisma/client/index.js)" = "$(sha "$PKG/payload/prisma-client/index.js")" ]
put "$PKG/payload/schema.prisma" prisma/schema.prisma
while read -r rel; do
  [ -e "public/$rel" ] && continue
  put "$PKG/payload/public/$rel" "public/$rel"
done < "$PKG/expected/assets.txt"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do put "$PKG/payload/$f" "$f" || exit 1; done
put "$PKG/payload/public/system.html" public/system.html
say "OK: files written and verified"

say "--- 7) restart (PM2 via the restart-on-request cron, up to ~1 minute)"
restart_app
wait_restart "$PIDS_BEFORE" || { say "!! the app process was not restarted (still: $(app_pids)); is the restart cron running?"; false; }
three_health || { say "!! API did not become healthy after restart"; false; }
say "OK: three healthy API responses after restart (processes: ${PIDS_BEFORE:-?} → $(app_pids))"

say "--- 8) post-install checks"
for p in /login /club/subscriptions/expiring /club/subscriptions/whatsapp-templates; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new management HTML"; false; }
done
ENTRY=$(grep -oE 'src="/assets/[^"]+\.js"' "$PKG/payload/public/system.html" | head -1 | sed 's/src="//;s/"$//')
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$ENTRY")
[ "$code" = 200 ] || { say "!! $ENTRY returned $code"; false; }
for p in employees club-whatsapp-templates club-subscriptions club-sales-dashboard club-sales-settings/sales-reps; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/$p")
  [ "$code" = 401 ] || { say "!! unauthenticated GET /api/$p returned $code (expected 401)"; false; }
done
grep -q getNationalIdValidationError dist/modules/club-members/club-members.service.js || { say "!! 18-r1 national-ID rule missing"; false; }
grep -q ClubSalesModule dist/app.module.js || { say "!! sales module not registered"; false; }
[ -f dist/modules/club-subscriptions/club-whatsapp-templates.controller.js ] || { say "!! WhatsApp templates controller missing"; false; }
say "OK: new HTML on 3 routes, $ENTRY 200, 5 API routes 401 JSON, new modules in place"
trap - ERR
say
say "UPDATE VERIFIED: 2026-11-19-r1; database, Prisma Client, backend and management UI updated; API healthy."
say "backup: $BACKUP"
say "undo files + Client (keeps the database): $UNDO"
say "full database restore (only if really needed; loses everything written after the update):"
say "  gunzip < $BACKUP/database.sql.gz | mysql $DB"

