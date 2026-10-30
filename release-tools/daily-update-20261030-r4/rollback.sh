#!/usr/bin/env bash
# Undo the 2026-10-30-r4 install using the backup folder that install.sh printed.
#   bash noamany-daily-update-20261030-r4/rollback.sh /home/noamanycenter/final.noamanycenter.com/tmp/oct30-r4-update-backup.XXXXXX
# Restores the changed backend files and public/system.html, removes the new backend files,
# keeps the added assets (open browser tabs may still load them), restarts and health-checks.
# Refuses to overwrite files that changed after this install unless FORCE=1.
set -Eeuo pipefail

REL=20261030-r4
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
BACKUP="${1:-}"
AUTO="${2:-}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"

say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "ROLLBACK FAILED: $REL"; exit 1; }
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

[ -n "$BACKUP" ] || die "usage: rollback.sh <backup folder printed by install.sh>"
BACKUP="$(cd "$BACKUP" 2>/dev/null && pwd)" || die "backup folder not found"
case "$BACKUP" in "$APP"/tmp/oct30-r4-update-backup.*) ;; *) die "not a 30-r4 backup inside $APP/tmp: $BACKUP" ;; esac
[ "$(cat "$BACKUP/RELEASE" 2>/dev/null)" = "$REL" ] || die "backup belongs to another release"

say "=== rollback $REL from $BACKUP ==="
(cd "$BACKUP/files" && while read -r s rel; do [ "$(sha "$rel")" = "$s" ] || { echo "corrupt: $rel"; exit 1; }; done < ../MANIFEST) \
  || die "backup is corrupt"

# Each live file must still be this package's version (or already the backed-up one).
if [ "${FORCE:-0}" != 1 ]; then
  while read -r s rel; do
    [ -f "$rel" ] || continue
    cur=$(sha "$rel")
    [ "$cur" = "$s" ] && continue
    [ -f "$PKG/payload/$rel" ] && [ "$cur" = "$(sha "$PKG/payload/$rel")" ] && continue
    die "$rel changed after the install (not 30-r4, not the backup). Check before forcing with FORCE=1."
  done < "$BACKUP/MANIFEST"
fi

OWNER=$(owner_of dist/main.js)
while read -r s rel; do
  cp -p "$BACKUP/files/$rel" "$rel.rbtmp"
  mv -f "$rel.rbtmp" "$rel"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$rel"
  [ "$(sha "$rel")" = "$s" ] || die "$rel not restored correctly"
done < "$BACKUP/MANIFEST"
while read -r rel; do rm -f "$rel"; done < "$BACKUP/NEW-BACKEND-FILES"
say "OK: $(wc -l < "$BACKUP/MANIFEST" | tr -d ' ') files restored, new backend files removed"

# root's PM2 runs the app; a cron job restarts it within ~1 minute of tmp/restart.txt appearing.
PIDS_BEFORE=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true)
mkdir -p tmp && touch tmp/restart.txt
[ "$(id -u)" = 0 ] && chown "$OWNER" tmp/restart.txt || true
restarted=0
for _ in $(seq 1 80); do
  now=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true)
  if [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$PIDS_BEFORE" ]; then restarted=1; break; fi
  sleep 3
done
[ "$restarted" = 1 ] || die "the app process was not restarted; is the restart cron running?"
three_health || die "API not healthy after rollback restart"
got=$(curl -fsS -m 20 -H 'Accept: text/html' -H 'Cache-Control: no-cache' "$SITE/login" | sha256sum | cut -d' ' -f1)
[ "$got" = "$(sha public/system.html)" ] || die "/login does not serve the restored management HTML"
say "ROLLBACK VERIFIED: $REL removed; 30-r3 files restored; API healthy."
[ "$AUTO" = --auto ] || true
