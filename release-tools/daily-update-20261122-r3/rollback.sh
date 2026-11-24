#!/usr/bin/env bash
# Undo 2026-11-22-r3:  bash noamany-daily-update-20261122-r3/rollback.sh <backup folder printed by install.sh>
# Restores public/system.html (back to 22-r2). The added assets stay; the old HTML does not reference them.
set -Eeuo pipefail
REL=20261122-r3
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
BACKUP="${1:-}"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "ROLLBACK FAILED: $REL"; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
owner_of() { stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"; }
[ -n "$BACKUP" ] || die "usage: rollback.sh <backup folder>"
BACKUP="$(cd "$BACKUP" 2>/dev/null && pwd)" || die "backup folder not found"
case "$BACKUP" in "$APP"/tmp/nov22-r3-update-backup.*) ;; *) die "not a 22-r3 backup: $BACKUP" ;; esac
[ "$(cat "$BACKUP/RELEASE" 2>/dev/null)" = "$REL" ] || die "backup belongs to another release"
OWNER=$(owner_of public/system.html)
while read -r s rel; do
  [ "$(sha "$BACKUP/files/$rel")" = "$s" ] || die "backup is corrupt ($rel)"
  cp -p "$BACKUP/files/$rel" "$rel.rbtmp"; mv -f "$rel.rbtmp" "$rel"
  [ "$(id -u)" = 0 ] && chown "$OWNER" "$rel"
  [ "$(sha "$rel")" = "$s" ] || die "$rel not restored"
done < "$BACKUP/MANIFEST"
say "ROLLBACK VERIFIED: $REL removed; public/system.html is back to 22-r2."
