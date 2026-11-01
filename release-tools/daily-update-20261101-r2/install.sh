#!/usr/bin/env bash
# Noamany daily update 2026-11-01-r2 installer.
#   cd /home/noamanycenter/final.noamanycenter.com
#   unzip -o noamany-daily-update-20261101-r2.zip
#   bash noamany-daily-update-20261101-r2/install.sh
# Contents: attendance parity with the latest legacy system (Cairo time, night shifts, stale open
# rows, shift-assignment branches, legacy swap/extra-hours target, points bands) and punch photo
# thumbnails. Four backend files on top of 01-r1. No database, Prisma schema, main.js or
# app.module.js changes.
set -Eeuo pipefail

REL=20261101-r2
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
TEST_MODE="${TEST_MODE:-0}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"

say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
owner_of() { stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"; }
run_timeout() { if command -v timeout >/dev/null; then timeout "$@"; else shift; "$@"; fi; }

health_ok() {
  local body
  body=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e '
    const b = JSON.parse(process.argv[1]);
    const age = Math.abs(Date.now() - Date.parse(b.ts));
    process.exit(b.status === "ok" && b.app === "Noamany HR API" && age < 180000 ? 0 : 1);
  ' "$body" 2>/dev/null
}
# Wait for the app to answer, then require three consecutive healthy, fresh responses.
three_health() {
  local i ok=0
  for i in $(seq 1 60); do
    if health_ok; then ok=$((ok + 1)); [ "$ok" -ge 3 ] && return 0; else ok=0; fi
    sleep 3
  done
  return 1
}
# On this server the app runs under root's PM2 as "noamany-final" (node $APP/dist/main.js).
# A root cron job (/usr/local/sbin/restart-noamany-on-request, every minute) deletes
# tmp/restart.txt and runs "pm2 restart noamany-final". So a restart takes up to ~1 minute.
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
restart_app() {
  mkdir -p tmp
  touch tmp/restart.txt
  [ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
}
# Wait until the cron job has taken the request and PM2 runs a new process (max ~4 minutes).
wait_restart() {
  local before="$1" i now
  for i in $(seq 1 80); do
    now=$(app_pids)
    if [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ]; then return 0; fi
    sleep 3
  done
  return 1
}

# ---------------------------------------------------------------------------
say "=== Noamany update $REL ==="
say "app: $APP"
say "package: $PKG"

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
[ "$(sha prisma/schema.prisma)" = "$(cat "$PKG/expected/schema.sha256")" ] || die "prisma/schema.prisma differs from the reviewed schema"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html differs from 01-r1 (someone changed the UI since)"
while read -r rel exp; do
  [ -f "dist/$rel" ] || die "missing dist/$rel"
  [ "$(norm "dist/$rel")" = "$exp" ] || die "dist/$rel differs from the 01-r1 baseline"
done < "$PKG/expected/backend-baseline.txt"
while read -r rel; do
  [ ! -e "dist/$rel" ] || die "dist/$rel already exists (unexpected)"
done < "$PKG/expected/backend-new.txt"
say "OK: schema, management HTML and $(wc -l < "$PKG/expected/backend-baseline.txt" | tr -d ' ') backend files match the 01-r1 baseline"

CONFLICT=0
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then
    say "!! public/$rel exists with different content"; CONFLICT=1
  fi
done < "$PKG/expected/assets.txt"
[ "$CONFLICT" = 0 ] || die "asset name collision"
say "OK: $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, no collisions"

FREE_KB=$(df -Pk "$APP" | awk 'NR==2{print $4}')
[ "$FREE_KB" -gt 1048576 ] || die "less than 1 GB free disk"
three_health || die "API is not healthy before the update"
say "OK: API healthy before the update"

say "--- 4) staged backend check (live dist is not touched)"
STAGE=$(mktemp -d "$APP/tmp/nov01-r2-stage.XXXXXX")
cp -a dist "$STAGE/dist"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do cp "$PKG/payload/$f" "$STAGE/$f"; done
CHANGED=$(cut -d' ' -f1 "$PKG/expected/backend-baseline.txt"; cat "$PKG/expected/backend-new.txt")
BASE_MODS=$(cut -d' ' -f1 "$PKG/expected/backend-baseline.txt")
# shellcheck disable=SC2086
if run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$APP/dist" $BASE_MODS >"$STAGE/base-check.log" 2>&1; then
  say "baseline (current dist): Nest graph builds"
  # shellcheck disable=SC2086
  run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" $CHANGED >"$STAGE/new-check.log" 2>&1 \
    || { cat "$STAGE/new-check.log"; die "new backend fails the Nest dependency check"; }
else
  say "note: the Nest graph check also fails on the current dist on this server (see $STAGE/base-check.log); using module load check only"
  # shellcheck disable=SC2086
  LOAD_ONLY=1 run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" $CHANGED >"$STAGE/new-check.log" 2>&1 \
    || { cat "$STAGE/new-check.log"; die "new backend modules fail to load"; }
fi
tail -1 "$STAGE/new-check.log"
rm -rf "$STAGE"

say "--- 5) backup"
BACKUP=$(mktemp -d "$APP/tmp/nov01-r2-update-backup.XXXXXX")
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
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "backup verification failed"
say "OK: backup $BACKUP ($(wc -l < "$BACKUP/MANIFEST" | tr -d ' ') files, verified)"
UNDO="bash $PKG/rollback.sh $BACKUP"

# ---------------------------------------------------------------------------
# From here on, any failure restores the backup automatically.
MAIN_PID=$$
auto_rollback() {
  # set -E also fires this trap inside $(...) subshells, e.g. a health probe that fails
  # while Passenger is still restarting. Only the main script may roll back.
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  say "!! failure after changes started — restoring the backup automatically"
  if bash "$PKG/rollback.sh" "$BACKUP" --auto; then
    say "ROLLBACK DONE: the server is back on 01-r1. Send this log."
  else
    say "!! automatic rollback did not finish. Run: $UNDO"
  fi
  exit 1
}
trap auto_rollback ERR

say "--- 6) apply (assets → backend → management HTML)"
PIDS_BEFORE=$(app_pids)
while read -r rel; do
  [ -e "public/$rel" ] && continue
  mkdir -p "public/$(dirname "$rel")"
  cp "$PKG/payload/public/$rel" "public/$rel.r1tmp"
  mv -f "public/$rel.r1tmp" "public/$rel"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "public/$rel"
  chmod 664 "public/$rel"
done < "$PKG/expected/assets.txt"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do
  mkdir -p "$(dirname "$f")"
  cp "$PKG/payload/$f" "$f.r1tmp"
  mv -f "$f.r1tmp" "$f"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$f"
  chmod 664 "$f"
done
cp "$PKG/payload/public/system.html" public/system.html.r1tmp
mv -f public/system.html.r1tmp public/system.html
[ "$(id -u)" = 0 ] && chown "$OWNER" public/system.html
chmod 664 public/system.html
(cd "$PKG/payload" && find dist public/system.html -type f) | while read -r f; do
  [ "$(sha "$f")" = "$(sha "$PKG/payload/$f")" ] || { say "!! $f was not written correctly"; exit 1; }
done
say "OK: files written and verified"

say "--- 7) restart (PM2 via the restart-on-request cron, up to ~1 minute)"
restart_app
wait_restart "$PIDS_BEFORE" || { say "!! the app process was not restarted (still: $(app_pids)); is the restart cron running?"; false; }
three_health || { say "!! API did not become healthy after restart"; false; }
PIDS_AFTER=$(app_pids)
say "OK: three healthy API responses after restart (processes: ${PIDS_BEFORE:-?} → ${PIDS_AFTER:-?})"

say "--- 8) post-install checks"
for p in /login /club/subscriptions /reports/finance/daily-closing; do
  # The app only serves the management shell to browser-style requests.
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new management HTML"; false; }
done
ENTRY=$(grep -oE 'src="/assets/[^"]+\.js"' "$PKG/payload/public/system.html" | head -1 | sed 's/src="//;s/"$//')
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$ENTRY")
[ "$code" = 200 ] || { say "!! $ENTRY returned $code"; false; }
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/employees")
[ "$code" = 401 ] || { say "!! unauthenticated GET /api/employees returned $code (expected 401)"; false; }
grep -q SUB_BRANCH_IDS dist/common/branch-scope/branch-scope.service.js || { say "!! 29-r2 backend code missing from dist"; false; }
grep -q secondLateMin dist/modules/attendance/attendance.service.js || { say "!! 01-r1 attendance report code missing from dist"; false; }
grep -q businessMidnightEpoch dist/common/utils/legacy-date.util.js || { say "!! new Cairo-time code not in dist"; false; }
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/system-v2.webmanifest")
[ "$code" = 200 ] || { say "!! /system-v2.webmanifest returned $code (expected 200)"; false; }
say "OK: /login and two admin routes serve the new HTML, $ENTRY 200, manifest 200, API routes 401 JSON"

trap - ERR
say
say "UPDATE VERIFIED: 2026-11-01-r2; backend and management UI updated; API healthy."
say "backup: $BACKUP"
say "undo (this install only): $UNDO"
