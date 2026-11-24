#!/usr/bin/env bash
# Noamany update 2026-11-24-r7 (on top of 24-r6). Code only — no database, schema, Client or UI change.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261124-r7.zip
#   bash noamany-daily-update-20261124-r7/install.sh
# Reception: a photo-only change and attachment list/open/upload work for any member of the branch
# (were refused for members not registered today); reception supervisors are not limited to today.
# Backend: modules/club-members/club-members.service.js only.
set -Eeuo pipefail
REL=20261124-r7
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
F=modules/club-members/club-members.service.js
BASE_NORM=5289b9384747c32c3112d164866bb9514019eb0535721e0d6e11d343f83c5dba
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
health_ok() { local b; b=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e 'const b=JSON.parse(process.argv[1]);process.exit(b.status==="ok"&&b.app==="Noamany HR API"&&Math.abs(Date.now()-Date.parse(b.ts))<180000?0:1)' "$b" 2>/dev/null; }
three_health() { local i ok=0; for i in $(seq 1 60); do if health_ok; then ok=$((ok+1)); [ "$ok" -ge 3 ] && return 0; else ok=0; fi; sleep 3; done; return 1; }
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
wait_restart() { local before="$1" i now; for i in $(seq 1 80); do now=$(app_pids); if [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ]; then return 0; fi; sleep 3; done; return 1; }

say "=== Noamany update $REL ==="
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch"
LOCK="$APP/tmp/noamany-update.lock"; mkdir -p "$APP/tmp"
mkdir "$LOCK" 2>/dev/null || die "another install is running or crashed ($LOCK exists)"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
OWNER=$(stat -c '%U:%G' dist/main.js)
[ "$(norm "dist/$F")" = "$BASE_NORM" ] || die "dist/$F is not 24-r6's (changed on the server?)"
grep -q "UPDATE VERIFIED: 2026-11-24-r6" tmp/install-20261124-r6.log || die "24-r6 is not the verified install"
three_health || die "API is not healthy before the update"
STAGE=$(mktemp -d "$APP/tmp/nov24-r7-stage.XXXXXX"); cp -a dist "$STAGE/dist"; cp "$PKG/payload/dist/$F" "$STAGE/dist/$F"
timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" "$F" > "$STAGE/check.log" 2>&1 || { tail -20 "$STAGE/check.log"; die "new backend fails the Nest dependency check"; }
tail -1 "$STAGE/check.log"; rm -rf "$STAGE"
BACKUP=$(mktemp -d "$APP/tmp/nov24-r7-update-backup.XXXXXX"); mkdir -p "$BACKUP/files/dist/modules/club-members"
cp -p "dist/$F" "dist/$F.map" "$BACKUP/files/dist/modules/club-members/"
echo "$REL" > "$BACKUP/RELEASE"
say "OK: backup $BACKUP"
PIDS_BEFORE=$(app_pids)
rollback() { trap - ERR; say "!! failure — restoring $F"; cp -p "$BACKUP/files/dist/$F" "dist/$F"; cp -p "$BACKUP/files/dist/$F.map" "dist/$F.map"; chown "$OWNER" "dist/$F" "dist/$F.map"; touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt; say "ROLLBACK DONE (restart requested)"; exit 1; }
trap rollback ERR
for x in "$F" "$F.map"; do cp "$PKG/payload/dist/$x" "dist/$x.r2407tmp"; mv -f "dist/$x.r2407tmp" "dist/$x"; chown "$OWNER" "dist/$x"; chmod 664 "dist/$x"; [ "$(sha "dist/$x")" = "$(sha "$PKG/payload/dist/$x")" ]; done
say "OK: file written"
touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt
wait_restart "$PIDS_BEFORE" || { say "!! app not restarted"; false; }
three_health || { say "!! API not healthy after restart"; false; }
grep -q isPhotoOnlyMemberUpdate "dist/$F" || { say "!! fix missing"; false; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/club-members/1/membership-documents")" = 401 ] || { say "!! members API not 401"; false; }
trap - ERR
say "UPDATE VERIFIED: 2026-11-24-r7; reception photo/attachments fix live; API healthy."
say "backup: $BACKUP"
say "undo: cp -p $BACKUP/files/dist/$F* $APP/dist/modules/club-members/ && touch $APP/tmp/restart.txt"
