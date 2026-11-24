#!/usr/bin/env bash
# Noamany daily update 2026-11-22-r8 (on top of 22-r7). Code only — no database, schema or Prisma Client.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261122-r8.zip
#   bash noamany-daily-update-20261122-r8/install.sh            # update
#   PRUNE=1 bash noamany-daily-update-20261122-r8/install.sh    # update, then remove old update leftovers
# Contents (client, 23 Nov — captains): a captain gets a coach record wherever they are made a captain —
# the staff-setup screen now links them too; deleting an employee hides their coach record; any job title with
# «كابتن» (or coach / captain) counts as a coach title even when «مدرب» was not ticked.
# Backend only: 4 changed files (trainer-sync.util, staff-setup.service, employees.service, org.service).
# No database change on install (today only «كابتن» matches, and it is already flagged).
set -Eeuo pipefail
REL=20261122-r8
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
TEST_MODE="${TEST_MODE:-0}"
PRUNE="${PRUNE:-0}"
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
three_health() {
  local i ok=0
  for i in $(seq 1 60); do
    if health_ok; then ok=$((ok + 1)); [ "$ok" -ge 3 ] && return 0; else ok=0; fi
    sleep 3
  done
  return 1
}
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
put() {
  mkdir -p "$(dirname "$2")"
  cp "$1" "$2.r2208tmp"
  mv -f "$2.r2208tmp" "$2"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$2"
  chmod 664 "$2"
  [ "$(sha "$2")" = "$(sha "$1")" ] || { say "!! $2 was not written correctly"; return 1; }
}

say "=== Noamany update $REL ==="
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
fi
OWNER=$(owner_of dist/main.js)
grep -qx "$(sha public/system.html)" "$PKG/expected/system.html.sha256" || die "public/system.html is not what 22-r7 left (install 22-r7 first)"
[ "$(sha prisma/schema.prisma)" = "$(cat "$PKG/expected/schema.sha256")" ] || die "prisma/schema.prisma is not what 22-r7 left"
[ "$(sha node_modules/.prisma/client/index.js)" = "$(cat "$PKG/expected/client-index.sha256")" ] || die "the Prisma Client is not what 22-r7 left"
while read -r rel exp; do
  if [ "$exp" = ABSENT ]; then [ ! -e "dist/$rel" ] || die "dist/$rel already exists (expected a new file)"; continue; fi
  [ -f "dist/$rel" ] || die "missing dist/$rel"
  [ "$(norm "dist/$rel")" = "$exp" ] || die "dist/$rel differs from what the server should have (22-r7)"
done < "$PKG/expected/backend-baseline.txt"
CONFLICT=0
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then say "!! public/$rel differs"; CONFLICT=1; fi
done < "$PKG/expected/assets.txt"
[ "$CONFLICT" = 0 ] || die "asset name collision"
three_health || die "API is not healthy before the update"
say "OK: baseline (HTML, schema, Client, $(wc -l < "$PKG/expected/backend-baseline.txt" | tr -d ' ') backend file), $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, API healthy"

say "--- 4) staged check"
STAGE=$(mktemp -d "$APP/tmp/nov22-r8-stage.XXXXXX")
cp -a dist "$STAGE/dist"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do mkdir -p "$STAGE/$(dirname "$f")"; cp "$PKG/payload/$f" "$STAGE/$f"; done
CHANGED=$(cut -d' ' -f1 "$PKG/expected/backend-baseline.txt")
# shellcheck disable=SC2086
run_timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" $CHANGED >"$STAGE/check.log" 2>&1 \
  || { tail -20 "$STAGE/check.log"; rm -rf "$STAGE"; die "new backend fails the Nest dependency check"; }
tail -1 "$STAGE/check.log"
rm -rf "$STAGE"

say "--- 5) backup (only the files this update replaces)"
BACKUP=$(mktemp -d "$APP/tmp/nov22-r8-update-backup.XXXXXX")
mkdir -p "$BACKUP/files"
: > "$BACKUP/MANIFEST"
for rel in $(while read -r r _; do echo "dist/$r"; echo "dist/$r.map"; done < "$PKG/expected/backend-baseline.txt") public/system.html; do
  [ -f "$rel" ] || continue
  mkdir -p "$BACKUP/files/$(dirname "$rel")"
  cp -p "$rel" "$BACKUP/files/$rel"
  echo "$(sha "$BACKUP/files/$rel") $rel" >> "$BACKUP/MANIFEST"
done
echo "$REL" > "$BACKUP/RELEASE"
# Files this update adds (none before it): rollback deletes them.
awk '$2=="ABSENT"{print "dist/"$1; print "dist/"$1".map"}' "$PKG/expected/backend-baseline.txt" > "$BACKUP/NEW_FILES"
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "backup verification failed"
say "OK: backup $BACKUP ($(du -sh "$BACKUP" | cut -f1))"
UNDO="bash $PKG/rollback.sh $BACKUP"

MAIN_PID=$$
auto_rollback() {
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  say "!! failure after changes started — restoring the backup automatically"
  if bash "$PKG/rollback.sh" "$BACKUP" --auto; then say "ROLLBACK DONE: back on 22-r7. Send this log."; else say "!! automatic rollback did not finish. Run: $UNDO"; fi
  exit 1
}
trap auto_rollback ERR

say "--- 6) apply (assets → backend → management HTML)"
PIDS_BEFORE=$(app_pids)
while read -r rel; do [ -e "public/$rel" ] || put "$PKG/payload/public/$rel" "public/$rel"; done < "$PKG/expected/assets.txt"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do put "$PKG/payload/$f" "$f" || exit 1; done
put "$PKG/payload/public/system.html" public/system.html
say "OK: files written and verified"

say "--- 7) restart"
touch tmp/restart.txt; [ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
wait_restart "$PIDS_BEFORE" || { say "!! the app process was not restarted; is the restart cron running?"; false; }
three_health || { say "!! API did not become healthy after restart"; false; }
say "OK: three healthy API responses after restart"


say "--- 8) post-install checks"
for p in /login /club/subscriptions; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new management HTML"; false; }
done
ENTRY=$(grep -oE 'src="/assets/[^"]+\.js"' "$PKG/payload/public/system.html" | head -1 | sed 's/src="//;s/"$//')
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$ENTRY")" = 200 ] || { say "!! $ENTRY not served"; false; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/club-subscriptions")" = 401 ] || { say "!! /api/club-subscriptions not 401"; false; }
grep -q "jobCountsAsTrainer" dist/modules/club-fitness/trainer-sync.util.js || { say "!! captain title rule missing"; false; }
grep -q "syncEmployeeTrainer" dist/modules/rbac/admin/staff-setup.service.js || { say "!! staff setup coach link missing"; false; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/club-attendance/barcode-scan-times")" = 401 ] || { say "!! barcode scan times not 401"; false; }
trap - ERR
say
say "UPDATE VERIFIED: 2026-11-22-r8; backend and management UI updated; API healthy."
say "backup: $BACKUP"
say "undo: $UNDO"

if [ "$PRUNE" = 1 ]; then
  say "--- 9) remove old update leftovers (PRUNE=1)"
  KEEP_RE='(nov22-r8|noamany-daily-update-20261122-r8|nov22-r7|noamany-daily-update-20261122-r7|nov22-r2|noamany-daily-update-20261122-r2|nov22-r1|noamany-daily-update-20261122-r1|nov21-r2|noamany-daily-update-20261121-r2|nov21-r1|noamany-daily-update-20261121-r1|nov20-r1|noamany-daily-update-20261120-r1|nov19-r6|noamany-daily-update-20261119-r6|nov19-r6|noamany-daily-update-20261119-r6|nov19-r4|nov19-r3|nov19-r2|nov19-r1|nov18-r1|noamany-daily-update-20261120-r1|noamany-daily-update-20261119-r4|noamany-roles-update-20261119-r3|noamany-daily-update-20261119-r2|noamany-full-update-20261119-r1|noamany-daily-update-20261118-r1)'
  before=$(df -Pk "$APP" | awk 'NR==2{print $4}')
  {
    # Staging folders are only ever needed during an install; any left over are from old or failed runs.
    find "$APP/tmp" -mindepth 1 -maxdepth 1 -type d -name '*stage*' -mmin +60
    # Update backups and update packages older than 7 days.
    find "$APP/tmp" -mindepth 1 -maxdepth 1 -type d -name '*backup*' -mtime +7
    find "$APP" -mindepth 1 -maxdepth 1 \( -name 'noamany-*update*' -o -name 'noamany-hr-mobile-api-update-*' \) -mtime +7
  } | grep -Ev "$KEEP_RE" | sort -u > "$APP/tmp/prune-$REL.list" || true
  while read -r p; do
    case "$p" in "$APP"/tmp/*|"$APP"/noamany-*) rm -rf -- "$p"; say "removed ${p#$APP/}";; *) say "skipped $p";; esac
  done < "$APP/tmp/prune-$REL.list"
  after=$(df -Pk "$APP" | awk 'NR==2{print $4}')
  say "CLEANUP DONE: $(wc -l < "$APP/tmp/prune-$REL.list" | tr -d ' ') items removed, $(( (after - before) / 1024 )) MB freed (list: tmp/prune-$REL.list)"
fi
