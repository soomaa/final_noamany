#!/usr/bin/env bash
# One-time setup of the continuous old -> new gym sync. Runs ON THE SERVER as root:
#   bash legacy-gym-sync.sh              # first, the dry run: shows what would be added/changed
#   bash install-legacy-gym-sync.sh      # backup, first real sync, then cron every 5 minutes
#   ONCE=1 bash install-legacy-gym-sync.sh   # backup and one real sync, no schedule
# Undo: rm /etc/cron.d/legacy-gym-sync (stops the sync); the backup printed below restores the
# tables as they were before the first sync.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD="${OLD_DB:-noamanycenter_noamany}"
NEW="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
SYNC_BIN="${SYNC_BIN:-/usr/local/sbin/legacy-gym-sync}"
LOG="$APP/tmp/legacy-gym-sync.log"
TABLES="club_subscription_types club_members club_subscriptions club_receipts club_receipt_payments club_subscription_freezes club_subscription_refunds club_subscription_transfers club_attendance club_locker_subscriptions club_lockers club_inbody_measurements tbl_discount_codes tbl_discount_cobones_employees tbl_emps_members_dis_codes tbl_cobon_exhausted_history tbl_points_history tbl_points_exhausted_history club_member_point_transactions legacy_record_mappings legacy_import_runs"

[ "$(id -u)" = 0 ] || [ "${LOCAL_TEST:-0}" = 1 ] || { echo "run as root"; exit 1; }
mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/legacy-gym-sync-backup-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --default-character-set=utf8mb4 --single-transaction --skip-triggers --set-gtid-purged=OFF "$NEW" $TABLES | gzip > "$BACKUP"
echo "backup of the new-system tables: $BACKUP"
echo "restore if needed: rm -f /etc/cron.d/legacy-gym-sync; gunzip -c $BACKUP | mysql --default-character-set=utf8mb4 $NEW"

install -m 755 "$HERE/legacy-gym-sync.sh" "$SYNC_BIN"
echo "--- first sync"
APPLY=1 OLD_DB="$OLD" NEW_DB="$NEW" SYNC_LOG="$LOG" "$SYNC_BIN"

echo "--- old vs new after the sync"
q() { mysql --default-character-set=utf8mb4 --batch --skip-column-names -e "$1"; }
KEY=$(q "SELECT source_key FROM \`$NEW\`.legacy_record_mappings WHERE legacy_table='tbl_subscription_members' AND target_table='club_subscriptions' GROUP BY source_key ORDER BY COUNT(*) DESC LIMIT 1")
for pair in "tbl_subscription_members:club_subscriptions" "tbl_members:club_members" "tbl_subscription_settings:club_subscription_types" "tbl_stopped_subscription:club_subscription_freezes"; do
  old_t=${pair%%:*}; new_t=${pair##*:}
  o=$(q "SELECT COUNT(*) FROM \`$OLD\`.\`$old_t\`")
  n=$(q "SELECT COUNT(*) FROM \`$NEW\`.legacy_record_mappings WHERE source_key='$KEY' AND legacy_table='$old_t' AND target_table='$new_t'")
  echo "$old_t: old=$o synced=$n"
done
q "SELECT 'old paid this month', COALESCE(SUM(paid),0) FROM \`$OLD\`.tbl_subscription_members WHERE FROM_UNIXTIME(CAST(date_add AS SIGNED)) >= DATE_FORMAT(UTC_DATE(),'%Y-%m-01')"
q "SELECT 'new LEG-S paid this month', COALESCE(SUM(paid_amount),0) FROM \`$NEW\`.club_subscriptions WHERE subscription_number LIKE 'LEG-S-%' AND registration_date >= DATE_FORMAT(UTC_DATE(),'%Y-%m-01')"

if [ "${LOCAL_TEST:-0}" = 1 ]; then echo "LOCAL TEST: cron not installed"; exit 0; fi
if [ "${ONCE:-0}" = 1 ]; then echo "LEGACY GYM ONE-TIME SYNC DONE (no schedule installed)"; exit 0; fi
cat > /etc/cron.d/legacy-gym-sync <<EOF
# Old gym system -> new system sync (subscriptions, members, payments, freezes, check-ins, discount codes, points...).
# Log: $LOG
*/5 * * * * root APPLY=1 QUIET=1 OLD_DB=$OLD NEW_DB=$NEW SYNC_LOG=$LOG $SYNC_BIN
EOF
chmod 644 /etc/cron.d/legacy-gym-sync
echo "LEGACY GYM SYNC INSTALLED (every 5 minutes). Log: $LOG"
