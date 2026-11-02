#!/usr/bin/env bash
# One-time data fix in the new system (noamanycenter_nest), run ON THE SERVER as root.
#   bash fix-hr-users.sh            # dry run: counts only, changes nothing
#   APPLY=1 bash fix-hr-users.sh    # backup, then apply in one transaction
#
# Old HR accounts 369-402 clash with accounts created separately in the new system
# (same user_id, different person). This:
# 1) links old accounts that already have an account in the new system (same phone/username,
#    or the same employee) to it: 375->374, 377->376, 391..398->379..386;
# 2) adds the other old accounts: under their own id when it is free (216, 389, 390, 399-402),
#    otherwise as 1000000 + old id (the new system's own rows live at 1,000,000 and up);
# 3) re-points the HR rows copied from the old system that store those user ids;
# 4) removes test rows made with the new system's test accounts in August
#    (notifications, one visit, three extra-hours rows) and copies the old notifications.
# Added accounts get no RBAC role, so they have no permissions until HR grants them.
set -euo pipefail
O="${OLD_DB:-noamanycenter_hr}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
q() { mysql --batch --skip-column-names -e "$1"; }

LINKED="WHEN 375 THEN 374 WHEN 377 THEN 376 WHEN 391 THEN 379 WHEN 392 THEN 380 WHEN 393 THEN 381 WHEN 394 THEN 382 WHEN 395 THEN 383 WHEN 396 THEN 384 WHEN 397 THEN 385 WHEN 398 THEN 386"
ADDED_NEW_ID="369,370,371,372,373,374,376,378,379,380,381,382,383,384,385,386,387,388"
ADDED_SAME_ID="216,389,390,399,400,401,402"
user_id() { echo "CASE $LINKED ELSE CASE WHEN $1 IN ($ADDED_NEW_ID) THEN $1 + 1000000 ELSE $1 END END" | sed "s/^CASE WHEN/CASE $1 WHEN/"; }
emp_id() { echo "CASE $1 WHEN 182 THEN 2602 WHEN 183 THEN 2603 WHEN 184 THEN 2604 WHEN 185 THEN 2605 WHEN 186 THEN 2606 WHEN 187 THEN 2607 WHEN 188 THEN 2608 WHEN 189 THEN 2609 WHEN 193 THEN 192 ELSE $1 END"; }
TEST_USERS="369,370,133"

user_cols=$(q "SET SESSION group_concat_max_len=100000; SELECT GROUP_CONCAT(CONCAT('\`',n.column_name,'\`') ORDER BY n.ordinal_position) FROM information_schema.columns n JOIN information_schema.columns o ON o.table_schema='$O' AND o.table_name=n.table_name AND o.column_name=n.column_name WHERE n.table_schema='$N' AND n.table_name='users'" | tail -1)
user_sel=$(printf '%s' "$user_cols" | sed 's/`\([^`]*\)`/o.`\1`/g')
user_sel="${user_sel//o.\`emp_code\`/$(emp_id o.emp_code) AS \`emp_code\`}"
user_sel_new_id="${user_sel//o.\`user_id\`/o.user_id + 1000000 AS \`user_id\`}"
notif_cols=$(q "SET SESSION group_concat_max_len=100000; SELECT GROUP_CONCAT(CONCAT('\`',n.column_name,'\`') ORDER BY n.ordinal_position) FROM information_schema.columns n JOIN information_schema.columns o ON o.table_schema='$O' AND o.table_name=n.table_name AND o.column_name=n.column_name WHERE n.table_schema='$N' AND n.table_name='tbl_notifications'" | tail -1)
notif_sel=$(printf '%s' "$notif_cols" | sed 's/`\([^`]*\)`/o.`\1`/g')
notif_sel="${notif_sel//o.\`from_user\`/$(user_id o.from_user) AS \`from_user\`}"
notif_sel="${notif_sel//o.\`to_user\`/$(user_id o.to_user) AS \`to_user\`}"
NOTIF_SAME="o.from_user <=> n.from_user AND o.to_user <=> n.to_user AND BINARY o.date_ar <=> BINARY n.date_ar AND o.fk_id <=> n.fk_id"

read -r -d '' COUNTS <<SQL || true
SELECT 'accounts to add (same id)', COUNT(*) FROM \`$O\`.users o WHERE o.user_id IN ($ADDED_SAME_ID) AND NOT EXISTS (SELECT 1 FROM \`$N\`.users n WHERE n.user_id = o.user_id);
SELECT 'accounts to add (1000000 + id)', COUNT(*) FROM \`$O\`.users o WHERE o.user_id IN ($ADDED_NEW_ID) AND NOT EXISTS (SELECT 1 FROM \`$N\`.users n WHERE n.user_id = o.user_id + 1000000);
SELECT 'regulation reads to re-point', COUNT(*) FROM \`$N\`.hr_lawyeh_files_seens n JOIN \`$O\`.hr_lawyeh_files_seens o ON o.id = n.id AND o.user_id_fk <=> n.user_id_fk WHERE NOT (n.user_id_fk <=> $(user_id n.user_id_fk));
SELECT 'messages to re-point', COUNT(*) FROM \`$N\`.hr_ta3mem_personal_msg n JOIN \`$O\`.hr_ta3mem_personal_msg o ON o.id = n.id AND o.publisher <=> n.publisher WHERE NOT (n.publisher <=> $(user_id n.publisher));
SELECT 'test notifications to remove', COUNT(*) FROM \`$N\`.tbl_notifications n LEFT JOIN \`$O\`.tbl_notifications o ON o.id = n.id WHERE n.id < 1000000 AND (o.id IS NULL OR NOT ($NOTIF_SAME)) AND (n.from_user IN ($TEST_USERS) OR n.to_user IN ($TEST_USERS));
SELECT 'non-test new-only notifications (kept)', COUNT(*) FROM \`$N\`.tbl_notifications n LEFT JOIN \`$O\`.tbl_notifications o ON o.id = n.id WHERE n.id < 1000000 AND (o.id IS NULL OR NOT ($NOTIF_SAME)) AND NOT (n.from_user IN ($TEST_USERS) OR n.to_user IN ($TEST_USERS));
SELECT 'old notifications to copy', COUNT(*) FROM \`$O\`.tbl_notifications o LEFT JOIN \`$N\`.tbl_notifications n ON n.id = o.id WHERE n.id IS NULL OR NOT ($NOTIF_SAME) AND (n.from_user IN ($TEST_USERS) OR n.to_user IN ($TEST_USERS));
SELECT 'test visit to remove', COUNT(*) FROM \`$N\`.tbl_emp_zeyarat n WHERE NOT EXISTS (SELECT 1 FROM \`$O\`.tbl_emp_zeyarat o WHERE o.id = n.id);
SELECT 'test extra-hours to remove', COUNT(*) FROM \`$N\`.tbl_emps_hours_edafi WHERE id >= 1000000 AND publisher IN ($TEST_USERS);
SQL

echo "=== rows that will change"
mysql --batch --skip-column-names -e "$COUNTS"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

BACKUP="$APP/tmp/hr-users-fix-backup-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" users hr_lawyeh_files_seens hr_ta3mem_personal_msg tbl_notifications tbl_emp_zeyarat tbl_emps_hours_edafi | gzip > "$BACKUP"
echo "backup: $BACKUP"

# Multi-table DELETE with an alias needs a default database.
mysql "$N" <<SQL
START TRANSACTION;
INSERT INTO \`$N\`.users ($user_cols) SELECT $user_sel FROM \`$O\`.users o
  WHERE o.user_id IN ($ADDED_SAME_ID) AND NOT EXISTS (SELECT 1 FROM \`$N\`.users n WHERE n.user_id = o.user_id);
INSERT INTO \`$N\`.users ($user_cols) SELECT $user_sel_new_id FROM \`$O\`.users o
  WHERE o.user_id IN ($ADDED_NEW_ID) AND NOT EXISTS (SELECT 1 FROM \`$N\`.users n WHERE n.user_id = o.user_id + 1000000);
UPDATE \`$N\`.hr_lawyeh_files_seens n JOIN \`$O\`.hr_lawyeh_files_seens o ON o.id = n.id AND o.user_id_fk <=> n.user_id_fk
  SET n.user_id_fk = $(user_id n.user_id_fk);
UPDATE \`$N\`.hr_ta3mem_personal_msg n JOIN \`$O\`.hr_ta3mem_personal_msg o ON o.id = n.id AND o.publisher <=> n.publisher
  SET n.publisher = $(user_id n.publisher);
DELETE n FROM \`$N\`.tbl_notifications n LEFT JOIN \`$O\`.tbl_notifications o ON o.id = n.id
  WHERE n.id < 1000000 AND (o.id IS NULL OR NOT ($NOTIF_SAME)) AND (n.from_user IN ($TEST_USERS) OR n.to_user IN ($TEST_USERS));
-- A real notification made in the new system that sits on an old id moves to the new system's range.
UPDATE \`$N\`.tbl_notifications n JOIN \`$O\`.tbl_notifications o ON o.id = n.id
  SET n.id = n.id + 1000000 WHERE n.id < 1000000 AND NOT ($NOTIF_SAME);
INSERT INTO \`$N\`.tbl_notifications ($notif_cols) SELECT $notif_sel FROM \`$O\`.tbl_notifications o
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.tbl_notifications n WHERE n.id = o.id);
DELETE n FROM \`$N\`.tbl_emp_zeyarat n WHERE NOT EXISTS (SELECT 1 FROM \`$O\`.tbl_emp_zeyarat o WHERE o.id = n.id);
DELETE FROM \`$N\`.tbl_emps_hours_edafi WHERE id >= 1000000 AND publisher IN ($TEST_USERS);
COMMIT;
SQL
# New notifications and accounts made in the new system start at 1,000,000+ (never an old id).
for t in tbl_notifications users; do
  pk=$( [ "$t" = users ] && echo user_id || echo id )
  mx=$(q "SELECT GREATEST(1000000, IFNULL(MAX(\`$pk\`), 0) + 1) FROM \`$N\`.\`$t\`")
  q "ALTER TABLE \`$N\`.\`$t\` AUTO_INCREMENT = $mx"
done
echo "=== after (should all be 0, except kept non-test notifications)"
mysql --batch --skip-column-names -e "$COUNTS"
echo "HR USERS FIX APPLIED"
echo "undo: zcat $BACKUP | mysql $N"
