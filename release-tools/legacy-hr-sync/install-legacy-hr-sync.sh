#!/usr/bin/env bash
# One-time setup of the old -> new HR sync. Runs ON THE SERVER as root:
#   bash install-legacy-hr-sync.sh
# 1) backs up the new-system tables the sync writes to;
# 2) moves the few rows created only in the new system to ids >= 1,000,000 and makes new rows
#    start there, so old and new ids can never collide;
# 3) runs the first sync and compares row counts;
# 4) installs /etc/cron.d/legacy-hr-sync (every 3 minutes) — skipped with ONCE=1 (one-time copy).
# Undo: rm /etc/cron.d/legacy-hr-sync, then restore the backup printed below if needed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD="${OLD_DB:-noamanycenter_hr}"
NEW="${NEW_DB:-noamanycenter_nest}"
NATIVE_FROM=1000000
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
SYNC_BIN="${SYNC_BIN:-/usr/local/sbin/legacy-hr-sync}"
TABLES="tbl_hdoor_emps tbl_hdoor_emps_history hr_all_agzat_orders hr_all_ozonat_orders tbl_emps_shef_edafi tbl_emps_hours_edafi hr_emp_agazat_dayes tbl_hdodr_setting tbl_hdoor_dawms_emps employees"
q() { mysql --batch --skip-column-names -e "$1"; }
pk_of() { case "$1" in tbl_hdoor_emps|tbl_hdoor_emps_history) echo hodoor_id ;; *) echo id ;; esac; }

[ "$(id -u)" = 0 ] || [ "${LOCAL_TEST:-0}" = 1 ] || { echo "run as root"; exit 1; }
mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/legacy-hr-sync-backup-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$NEW" $TABLES | gzip > "$BACKUP"
echo "backup of the new-system tables: $BACKUP"

for t in $TABLES; do
  [ "$t" = employees ] && continue
  pk=$(pk_of "$t")
  moved=$(q "UPDATE \`$NEW\`.\`$t\` n LEFT JOIN \`$OLD\`.\`$t\` o ON o.\`$pk\` = n.\`$pk\`
             SET n.\`$pk\` = n.\`$pk\` + $NATIVE_FROM
             WHERE o.\`$pk\` IS NULL AND n.\`$pk\` < $NATIVE_FROM; SELECT ROW_COUNT();")
  [ "$moved" = 0 ] || echo "$t: $moved row(s) created in the new system moved to ids >= $NATIVE_FROM"
  ai=$(q "SELECT IFNULL(auto_increment, 0) FROM information_schema.tables WHERE table_schema='$NEW' AND table_name='$t'")
  if [ "$ai" -lt "$NATIVE_FROM" ]; then
    mx=$(q "SELECT IFNULL(MAX(\`$pk\`), 0) + 1 FROM \`$NEW\`.\`$t\`")
    [ "$mx" -gt "$NATIVE_FROM" ] || mx=$NATIVE_FROM
    q "ALTER TABLE \`$NEW\`.\`$t\` AUTO_INCREMENT = $mx"
  fi
done

# Punch photos and other files uploaded through the old system (uploads/app/basma_img, ...):
# link every old upload folder the new system does not have, so /uploads/<same path> works there.
OLD_UPLOADS="${OLD_UPLOADS:-/home/noamanycenter/hr.noamanycenter.com/uploads}"
NEW_UPLOADS="${NEW_UPLOADS:-$APP/uploads}"
if [ -d "$OLD_UPLOADS" ] && [ -d "$NEW_UPLOADS/" ]; then
  for d in "$OLD_UPLOADS"/*/; do
    name=$(basename "$d")
    if [ ! -e "$NEW_UPLOADS/$name" ]; then
      ln -s "${d%/}" "$NEW_UPLOADS/$name"
      echo "linked old uploads/$name into the new system"
    fi
  done
fi

install -m 755 "$HERE/legacy-hr-sync.sh" "$SYNC_BIN"
OLD_DB="$OLD" NEW_DB="$NEW" SYNC_LOG="$APP/tmp/legacy-hr-sync.log" "$SYNC_BIN"
tail -1 "$APP/tmp/legacy-hr-sync.log"

echo "--- row counts (old ids only) old vs new"
ok=1
for t in $TABLES; do
  pk=$(pk_of "$t")
  if [ "$t" = employees ]; then
    o=$(q "SELECT COUNT(DISTINCT emp_code) FROM \`$OLD\`.employees WHERE emp_code IS NOT NULL")
    n=$(q "SELECT COUNT(*) FROM \`$OLD\`.employees o WHERE o.emp_code IS NOT NULL AND o.id = (SELECT MIN(id) FROM \`$OLD\`.employees x WHERE x.emp_code = o.emp_code) AND EXISTS (SELECT 1 FROM \`$NEW\`.employees n WHERE n.emp_code = o.emp_code)")
  else
    o=$(q "SELECT COUNT(*) FROM \`$OLD\`.\`$t\`")
    n=$(q "SELECT COUNT(*) FROM \`$NEW\`.\`$t\` WHERE \`$pk\` < $NATIVE_FROM")
  fi
  mark=OK; [ "$o" = "$n" ] || { mark=DIFFERENT; ok=0; }
  echo "$t: old=$o new=$n $mark"
done
if [ "${LOCAL_TEST:-0}" != 1 ]; then
  photo=$(q "SELECT hdoor_img_path FROM \`$NEW\`.tbl_hdoor_emps WHERE hdoor_img_path LIKE 'uploads/%' ORDER BY hodoor_id DESC LIMIT 1")
  echo "photo check: $(curl -s -o /dev/null -w '%{http_code} %{content_type}' -m 20 "https://final.noamanycenter.com/$photo") /$photo"
fi
echo "--- last punches in the new system"
q "SELECT hodoor_id, member_code, action_date, hdoor_time, ensraf_time, late_min FROM \`$NEW\`.tbl_hdoor_emps WHERE hodoor_id < $NATIVE_FROM ORDER BY hodoor_id DESC LIMIT 3"

if [ "${LOCAL_TEST:-0}" = 1 ]; then echo "LOCAL TEST: cron not installed"; exit 0; fi
# ONCE=1: copy the data one time only, no schedule (install the cron later by running without ONCE).
if [ "${ONCE:-0}" = 1 ]; then
  [ "$ok" = 1 ] && echo "LEGACY HR ONE-TIME SYNC DONE (no schedule installed)" || echo "LEGACY HR ONE-TIME SYNC DONE, but some counts differ — check the CONFLICT lines in the log"
  exit 0
fi
cat > /etc/cron.d/legacy-hr-sync <<EOF
# Old HR (hr.noamanycenter.com) -> new system sync. Log: $APP/tmp/legacy-hr-sync.log
*/3 * * * * root /usr/local/sbin/legacy-hr-sync
EOF
chmod 644 /etc/cron.d/legacy-hr-sync
[ "$ok" = 1 ] && echo "LEGACY HR SYNC INSTALLED (every 3 minutes)" || echo "LEGACY HR SYNC INSTALLED, but some counts differ — check the CONFLICT lines in the log"
