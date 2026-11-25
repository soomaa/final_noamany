#!/usr/bin/env bash
# Noamany update 2026-11-25-r6 (on top of 25-r5). One backend file + management UI. No database, schema or Client.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261125-r6.zip
#   bash noamany-daily-update-20261125-r6/install.sh
# Contents: dashboard «الخصومات الممنوحة» and «مصادر الإيراد» per branch; shares with a decimal.
set -Eeuo pipefail
REL=20261125-r6
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
norm() { sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }
FILE=dist/modules/club-dashboard/club-dashboard.service.js
OWNER=$(stat -c '%U:%G' dist/main.js)
health_ok() {
  local body
  body=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e 'const b=JSON.parse(process.argv[1]);process.exit(b.status==="ok"&&b.app==="Noamany HR API"&&Math.abs(Date.now()-Date.parse(b.ts))<180000?0:1)' "$body" 2>/dev/null
}
three_health() { local i ok=0; for i in $(seq 1 60); do if health_ok; then ok=$((ok+1)); [ "$ok" -ge 3 ] && return 0; else ok=0; fi; sleep 3; done; return 1; }
app_pids() { pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true; }
wait_restart() { local before="$1" i now; for i in $(seq 1 80); do now=$(app_pids); if [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ]; then return 0; fi; sleep 3; done; return 1; }

say "=== Noamany update $REL ==="
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not 25-r5's"
[ "$(norm "$FILE")" = "$(cat "$PKG/expected/backend.sha256")" ] || die "$FILE is not 25-r3's (changed on the server?)"
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then die "public/$rel exists with different content"; fi
done < "$PKG/expected/assets.txt"
three_health || die "API is not healthy before the update"
say "OK: preflight (system.html 25-r5, backend file 25-r3, $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, API healthy)"

BACKUP=$(mktemp -d "$APP/tmp/nov25-r6-update-backup.XXXXXX")
cp -p public/system.html "$BACKUP/system.html"; cp -p "$FILE" "$BACKUP/club-dashboard.service.js"; cp -p "$FILE.map" "$BACKUP/club-dashboard.service.js.map" 2>/dev/null || true
[ "$(sha "$BACKUP/club-dashboard.service.js")" = "$(sha "$FILE")" ] || die "backup failed"
say "OK: backup $BACKUP"

rollback() {
  trap - ERR
  say "!! failure — restoring 25-r5"
  cp -p "$BACKUP/club-dashboard.service.js" "$FILE"; [ -f "$BACKUP/club-dashboard.service.js.map" ] && cp -p "$BACKUP/club-dashboard.service.js.map" "$FILE.map"
  cp -p "$BACKUP/system.html" public/system.html
  local before; before=$(app_pids); touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt || true
  wait_restart "$before" && three_health && say "ROLLBACK DONE: back on 25-r5, API healthy." || say "!! rollback restart not confirmed — check the app"
  exit 1
}
trap rollback ERR
put() { cp "$1" "$2.r6tmp"; mv -f "$2.r6tmp" "$2"; chown "$OWNER" "$2"; chmod 664 "$2"; [ "$(sha "$2")" = "$(sha "$1")" ]; }
while read -r rel; do [ -e "public/$rel" ] || put "$PKG/payload/public/$rel" "public/$rel"; done < "$PKG/expected/assets.txt"
put "$PKG/payload/$FILE" "$FILE"; put "$PKG/payload/$FILE.map" "$FILE.map"
put "$PKG/payload/public/system.html" public/system.html
PIDS_BEFORE=$(app_pids)
touch tmp/restart.txt; chown "$OWNER" tmp/restart.txt || true
wait_restart "$PIDS_BEFORE"
three_health
for p in /login /dashboard; do
  [ "$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1)" = "$(sha "$PKG/payload/public/system.html")" ]
done
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")" = 200 ]; done
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/dashboard/executive")" = 401 ]
trap - ERR
say "UPDATE VERIFIED: 2026-11-25-r6; dashboard backend file + management UI updated; API healthy (processes: $PIDS_BEFORE→ $(app_pids))."
say "backup: $BACKUP"
