#!/usr/bin/env bash
# Undo 2026-11-19-r3: restores the 10 tables from the backup install.sh printed, forgets the migration,
# restarts. Use soon after the update: later edits to accounts, employees or roles would be lost.
#   bash noamany-roles-update-20261119-r3/rollback.sh /home/noamanycenter/final.noamanycenter.com/tmp/nov19-r3-roles-backup.XXXXXX
set -Eeuo pipefail
REL=20261119-r3
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(dirname "$PKG")}"
SITE="${SITE:-https://final.noamanycenter.com}"
DB="${DB:-noamanycenter_nest}"
BACKUP="${1:-}"
export PATH="/opt/cpanel/ea-nodejs20/bin:/opt/cpanel/ea-nodejs22/bin:$PATH"
cd "$APP"
say() { printf '%s\n' "$*"; }
die() { say "!! $*"; say "ROLLBACK FAILED: $REL"; exit 1; }
[ -n "$BACKUP" ] && [ -f "$BACKUP/tables.sql.gz" ] || die "usage: rollback.sh <backup folder printed by install.sh>"
[ "$(cat "$BACKUP/RELEASE" 2>/dev/null)" = "$REL" ] || die "backup belongs to another release"
gzip -t "$BACKUP/tables.sql.gz" || die "backup is corrupt"
gzip -dc "$BACKUP/tables.sql.gz" | mysql --default-character-set=utf8mb4 "$DB"
mysql "$DB" -e "DELETE FROM _prisma_migrations WHERE migration_name='20261118150000_seven_roles_and_sales_toggle'"
say "OK: roles, accounts and job titles restored"
before=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true)
touch tmp/restart.txt
for _ in $(seq 1 80); do now=$(pgrep -f "node $APP/dist/main.js" 2>/dev/null | sort | tr '\n' ' ' || true); [ ! -e tmp/restart.txt ] && [ -n "$now" ] && [ "$now" != "$before" ] && break; sleep 3; done
ok=0
for _ in $(seq 1 60); do
  if curl -fsS -m 20 "$SITE/api/health" 2>/dev/null | grep -q '"status":"ok"'; then ok=$((ok+1)); [ $ok -ge 3 ] && break; else ok=0; fi
  sleep 3
done
[ $ok -ge 3 ] || die "API not healthy after rollback"
say "ROLLBACK VERIFIED: $REL removed; roles as before; API healthy."
