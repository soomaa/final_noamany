#!/usr/bin/env bash
# Undo 2026-11-24-r3:  bash noamany-daily-update-20261124-r3/rollback.sh <backup folder printed by install.sh>
# Restores the replaced backend file(s) and public/system.html (back to the version before 24-r3), restarts and health-checks.
set -Eeuo pipefail
REL=20261124-r3
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
BACKUP="${1:-}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "ROLLBACK FAILED: $REL"; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
owner_of() { stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"; }
health_ok() {
  local body
  body=$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$SITE/api/health?t=$(date +%s)$RANDOM" 2>/dev/null) || return 1
  node -e 'const b=JSON.parse(process.argv[1]);process.exit(b.status==="ok"&&b.app==="Noamany HR API"&&Math.abs(Date.now()-Date.parse(b.ts))<180000?0:1)' "$body" 2>/dev/null
}
[ -n "$BACKUP" ] || die "usage: rollback.sh <backup folder>"
BACKUP="$(cd "$BACKUP" 2>/dev/null && pwd)" || die "backup folder not found"
case "$BACKUP" in "$APP"/tmp/nov24-r3-update-backup.*) ;; *) die "not a 24-r3 backup: $BACKUP" ;; esac
[ "$(cat "$BACKUP/RELEASE" 2>/dev/null)" = "$REL" ] || die "backup belongs to another release"
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || exit 1; done < ../MANIFEST) || die "backup is corrupt"
OWNER=$(owner_of dist/main.js)
while read -r s rel; do
  cp -p "$BACKUP/files/$rel" "$rel.rbtmp"; mv -f "$rel.rbtmp" "$rel"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$rel"
  [ "$(sha "$rel")" = "$s" ] || die "$rel not restored"
done < "$BACKUP/MANIFEST"
while read -r rel; do [ -n "$rel" ] && rm -f -- "$rel"; done < "$BACKUP/NEW_FILES"
say "OK: $(wc -l < "$BACKUP/MANIFEST" | tr -d ' ') files restored"
before=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true)
touch tmp/restart.txt; [ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
for _ in $(seq 1 80); do
  now=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true)
  [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ] && break
  sleep 3
done
ok=0; for _ in $(seq 1 60); do if health_ok; then ok=$((ok+1)); [ $ok -ge 3 ] && break; else ok=0; fi; sleep 3; done
[ $ok -ge 3 ] || die "API not healthy after rollback"
say "ROLLBACK VERIFIED: $REL removed; previous files restored; API healthy."
