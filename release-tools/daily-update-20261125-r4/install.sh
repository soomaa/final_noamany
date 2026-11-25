#!/usr/bin/env bash
# Noamany update 2026-11-25-r4 (on top of 25-r3). Management UI only — no backend, database, schema or Client.
#   cd /home/noamanycenter/final.noamanycenter.com && unzip -o noamany-daily-update-20261125-r4.zip
#   bash noamany-daily-update-20261125-r4/install.sh
# Contents: showing a phone number hides the one that was open (one number on screen at a time).
# The app serves public/system.html from disk on every request, so no restart is needed.
set -Eeuo pipefail
REL=20261125-r4
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "INSTALL FAILED: $REL — nothing was changed."; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
OWNER=$(stat -c '%U:%G' public/system.html)

say "=== Noamany update $REL ==="
(cd "$PKG" && sha256sum -c --quiet PACKAGE-SHA256SUMS) || die "package checksum mismatch"
[ "$(sha public/system.html)" = "$(cat "$PKG/expected/system.html.sha256")" ] || die "public/system.html is not 25-r3's"
while read -r rel; do
  if [ -e "public/$rel" ] && [ "$(sha "public/$rel")" != "$(sha "$PKG/payload/public/$rel")" ]; then die "public/$rel exists with different content"; fi
done < "$PKG/expected/assets.txt"
say "OK: preflight (system.html is 25-r3's, $(wc -l < "$PKG/expected/assets.txt" | tr -d ' ') new assets, no collisions)"

BACKUP=$(mktemp -d "$APP/tmp/nov25-r4-update-backup.XXXXXX")
cp -p public/system.html "$BACKUP/system.html"
[ "$(sha "$BACKUP/system.html")" = "$(sha public/system.html)" ] || die "backup failed"
say "OK: backup $BACKUP"

restore() { cp -p "$BACKUP/system.html" public/system.html.r4rb && mv -f public/system.html.r4rb public/system.html; say "!! restored the 25-r3 system.html"; exit 1; }
trap restore ERR
while read -r rel; do
  [ -e "public/$rel" ] && continue
  cp "$PKG/payload/public/$rel" "public/$rel.r4tmp" && mv -f "public/$rel.r4tmp" "public/$rel"
  chown "$OWNER" "public/$rel"; chmod 664 "public/$rel"
  [ "$(sha "public/$rel")" = "$(sha "$PKG/payload/public/$rel")" ]
done < "$PKG/expected/assets.txt"
cp "$PKG/payload/public/system.html" public/system.html.r4tmp && mv -f public/system.html.r4tmp public/system.html
chown "$OWNER" public/system.html; chmod 664 public/system.html
[ "$(sha public/system.html)" = "$(sha "$PKG/payload/public/system.html")" ]
for p in /login /club/members /club/staff-invitations; do
  got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE$p" | sha256sum | cut -d' ' -f1)
  [ "$got" = "$(sha "$PKG/payload/public/system.html")" ]
done
for a in $(grep -oE '/assets/[^"]+' "$PKG/payload/public/system.html"); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")" = 200 ]
done
trap - ERR
say "UPDATE VERIFIED: 2026-11-25-r4; management UI updated (new HTML on 3 routes, entry assets 200)."
say "undo: cp -p $BACKUP/system.html $APP/public/system.html"
