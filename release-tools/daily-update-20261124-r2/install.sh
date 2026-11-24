#!/usr/bin/env bash
# Noamany daily update 2026-11-24-r2 (on top of 24-r1). Management UI only — no backend, database or Prisma.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261124-r2.zip
#   bash noamany-daily-update-20261124-r2/install.sh
# Contents: reception member details — birth date locked (shown, not editable), and «مرفقات العضو» (list, open,
# upload, delete) under the member data.
# New hashed assets are added next to the old ones (nothing is deleted); public/system.html is swapped last.
# Backup = public/system.html only. No restart needed (static files), the API is health-checked anyway.
set -Eeuo pipefail
REL=20261124-r2
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
TEST_MODE="${TEST_MODE:-0}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"

say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
owner_of() { stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"; }
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
put() {
  mkdir -p "$(dirname "$2")"
  cp "$1" "$2.r2402tmp"
  mv -f "$2.r2402tmp" "$2"
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
OWNER=$(owner_of public/system.html)
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not what 24-r1 left (the UI changed since)"
CONFLICT=0
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then say "!! public/$rel differs"; CONFLICT=1; fi
done < "$PKG/expected/assets.txt"
[ "$CONFLICT" = 0 ] || die "asset name collision"
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do
  [ -f "$PKG/payload/public$a" ] || [ -f "public$a" ] || die "the new HTML needs $a, which is neither in the package nor on the server"
done
three_health || die "API is not healthy before the update"
say "OK: baseline HTML, $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, API healthy"

say "--- 4) backup (public/system.html)"
BACKUP=$(mktemp -d "$APP/tmp/nov24-r2-update-backup.XXXXXX")
mkdir -p "$BACKUP/files/public"
cp -p public/system.html "$BACKUP/files/public/system.html"
echo "$(sha "$BACKUP/files/public/system.html") public/system.html" > "$BACKUP/MANIFEST"
echo "$REL" > "$BACKUP/RELEASE"
[ "$(sha "$BACKUP/files/public/system.html")" = "$(sha public/system.html)" ] || die "backup verification failed"
say "OK: backup $BACKUP"
UNDO="bash $PKG/rollback.sh $BACKUP"

MAIN_PID=$$
auto_rollback() {
  [ "$(exec sh -c 'echo "$PPID"')" = "$MAIN_PID" ] || return 1
  trap - ERR
  say "!! failure after changes started — restoring the backup automatically"
  if bash "$PKG/rollback.sh" "$BACKUP" --auto; then say "ROLLBACK DONE: back on 24-r1. Send this log."; else say "!! automatic rollback did not finish. Run: $UNDO"; fi
  exit 1
}
trap auto_rollback ERR

say "--- 5) apply (new assets → management HTML)"
while read -r rel; do [ -e "public/$rel" ] || put "$PKG/payload/public/$rel" "public/$rel"; done < "$PKG/expected/assets.txt"
put "$PKG/payload/public/system.html" public/system.html
say "OK: files written and verified"

say "--- 6) post-install checks"
for p in /login /club/reception; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1) || { say "!! $p not served"; false; }
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ] || { say "!! $p does not serve the new management HTML"; false; }
done
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")" = 200 ] || { say "!! $a not served"; false; }
done
grep -lq "rm-att-label" public/assets/$(cat "$PKG/expected/reception-chunk.txt") || { say "!! reception attachments missing"; false; }
three_health || { say "!! API is not healthy"; false; }
trap - ERR
say
say "UPDATE VERIFIED: 2026-11-24-r2; management UI updated; API healthy."
say "backup: $BACKUP"
say "undo: $UNDO"
