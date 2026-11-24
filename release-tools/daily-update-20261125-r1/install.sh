#!/usr/bin/env bash
# Noamany update 2026-11-25-r1 (on top of 24-r7). Code + UI only — no database, schema or Client.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261125-r1.zip
#   bash noamany-daily-update-20261125-r1/install.sh
# Reception entry check uses the branch group (sibling-branch plans no longer «لا يوجد اشتراك نشط»);
# today's attendance: branch filter, WhatsApp on every row, none for a new plan's first visit;
# InBody under the subscription card with a paid «إضافة InBody»; staff-code button off the card;
# dashboard: «ملخص الفروع» first; «حذف (اتعمل بالغلط)» full purge of a mistaken subscription (new files).
set -Eeuo pipefail
REL=20261125-r1
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
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
put() { mkdir -p "$(dirname "$2")"; cp "$1" "$2.r2501tmp"; mv -f "$2.r2501tmp" "$2"; chown "$OWNER" "$2"; chmod 664 "$2"; [ "$(sha "$2")" = "$(sha "$1")" ] || { say "!! $2 not written"; return 1; }; }

say "=== Noamany update $REL ==="
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch"
LOCK="$APP/tmp/noamany-update.lock"; mkdir -p "$APP/tmp"
mkdir "$LOCK" 2>/dev/null || die "another install is running or crashed ($LOCK exists)"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
OWNER=$(stat -c '%U:%G' dist/main.js)
grep -q "UPDATE VERIFIED: 2026-11-24-r7" tmp/install-20261124-r7.log || die "24-r7 is not the verified install"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not 24-r6/r7's"
while read -r exp rel; do [ "$(norm "dist/$rel")" = "$exp" ] || die "dist/$rel is not 24-r7's (changed on the server?)"; done < "$PKG/expected/backend-baseline.txt"
while read -r rel; do [ ! -e "dist/$rel" ] || die "dist/$rel already exists (unexpected)"; done < "$PKG/expected/backend-new.txt"
CONFLICT=0
while read -r rel; do if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then say "!! public/$rel differs"; CONFLICT=1; fi; done < "$PKG/expected/assets.txt"
[ "$CONFLICT" = 0 ] || die "asset name collision"
three_health || die "API is not healthy before the update"
say "OK: baseline matches 24-r7 ($(wc -l < "$PKG/expected/backend-baseline.txt" | tr -d ' ') backend files, management HTML), $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets"
STAGE=$(mktemp -d "$APP/tmp/nov25-r1-stage.XXXXXX"); cp -a dist "$STAGE/dist"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do cp "$PKG/payload/$f" "$STAGE/$f"; done
# shellcheck disable=SC2046
timeout 300 node "$PKG/check-backend.cjs" "$APP" "$STAGE/dist" $(awk '{print $2}' "$PKG/expected/backend-baseline.txt") $(cat "$PKG/expected/backend-new.txt") > "$STAGE/check.log" 2>&1 || { tail -20 "$STAGE/check.log"; die "new backend fails the Nest dependency check"; }
tail -1 "$STAGE/check.log"; rm -rf "$STAGE"
BACKUP=$(mktemp -d "$APP/tmp/nov25-r1-update-backup.XXXXXX"); mkdir -p "$BACKUP/files"; : > "$BACKUP/MANIFEST"
bk() { [ -f "$1" ] || return 0; mkdir -p "$BACKUP/files/$(dirname "$1")"; cp -p "$1" "$BACKUP/files/$1"; echo "$(sha "$1") $1" >> "$BACKUP/MANIFEST"; }
while read -r _ rel; do bk "dist/$rel"; bk "dist/$rel.map"; done < "$PKG/expected/backend-baseline.txt"
bk public/system.html
while read -r rel; do echo "dist/$rel"; echo "dist/$rel.map"; done < "$PKG/expected/backend-new.txt" > "$BACKUP/NEW-BACKEND-FILES"
echo "$REL" > "$BACKUP/RELEASE"
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "backup verification failed"
say "OK: backup $BACKUP"
PIDS_BEFORE=$(app_pids)
rollback() { trap - ERR; say "!! failure — restoring the backup"; (cd "$BACKUP/files" && while read -r s rel; do cp -p "$rel" "$APP/$rel"; chown "$OWNER" "$APP/$rel"; done < ../MANIFEST); while read -r rel; do rm -f "$APP/$rel"; done < "$BACKUP/NEW-BACKEND-FILES"; touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt; say "ROLLBACK DONE (files restored, restart requested). Send this log."; exit 1; }
trap rollback ERR
while read -r rel; do [ -e "public/$rel" ] || put "$PKG/payload/public/$rel" "public/$rel"; done < "$PKG/expected/assets.txt"
(cd "$PKG/payload" && find dist -type f) | while read -r f; do put "$PKG/payload/$f" "$f" || exit 1; done
put "$PKG/payload/public/system.html" public/system.html
say "OK: files written"
touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt
wait_restart "$PIDS_BEFORE" || { say "!! app not restarted"; false; }
three_health || { say "!! API not healthy after restart"; false; }
for p in /login /dashboard /club/reception; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new HTML"; false; }
done
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")" = 200 ] || { say "!! $a not served"; false; }; done
for p in "club/entitlement/validate?memberId=1" "wa-reminders/absence?members=1" club-inbody-services/catalog club-subscriptions/1/purge-preview; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/$p")" = 401 ] || { say "!! /api/$p not 401"; false; }
done
grep -q entitlementBranchIds dist/modules/gym-ops/club-ops.controller.js || { say "!! entry-check fix missing"; false; }
trap - ERR
say "UPDATE VERIFIED: 2026-11-25-r1; backend and management UI updated; API healthy."
say "backup: $BACKUP"
say "undo: (cd $BACKUP/files && while read -r s rel; do cp -p \"\$rel\" \"$APP/\$rel\"; done < ../MANIFEST) && (cd $APP && xargs rm -f < $BACKUP/NEW-BACKEND-FILES) && touch $APP/tmp/restart.txt"
