#!/usr/bin/env bash
# One-time data fix in the new system (noamanycenter_nest), run ON THE SERVER as root.
#   bash fix-hr-branches-and-ids.sh            # dry run: counts only, changes nothing
#   APPLY=1 bash fix-hr-branches-and-ids.sh    # backup, then apply in one transaction
#
# 1) Branch numbers. The old HR system numbers attendance places by tbl_sites
#    (1 = البر الشرقي, 2 = الجلاء, 3 = طنطا; 0 = no site). The new system's branches are
#    2 = طنطا, 3 = البر الشرقي, 4 = الجلاء. The 7 Oct import mapped 2->2 and 3->3, which put
#    الجلاء on طنطا and طنطا on البر الشرقي (confirmed by punch GPS and by the employees HR
#    created directly in the new system). Re-derived here from the old rows.
# 2) Employees created separately in both systems have different ids. HR rows copied from
#    the old system are re-pointed to the new ids that the new system already uses
#    (accounts, gym sales). Codes 168 and 189 are branch accounts in the new system and
#    are left alone; the old employee هبه (code 189) is added.
# Users, roles and job titles are not touched (the new system's permissions depend on them).
set -euo pipefail
O="${OLD_DB:-noamanycenter_hr}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
q() { mysql --batch --skip-column-names -e "$1"; }

SITE_TO_BRANCH="CASE %s WHEN 0 THEN 3 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 3 THEN 2 ELSE %s END"
SITE_TO_BRANCH_KEEP0="CASE %s WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 3 THEN 2 ELSE %s END"
SITE_TO_BRANCH_TEXT="CASE TRIM(%s) WHEN '1' THEN '3' WHEN '2' THEN '4' WHEN '3' THEN '2' ELSE %s END"
m() { printf "$1" "$2" "$2"; }
# old employee id -> id the new system uses for the same person
ID_MAP="(SELECT 182 o, 2602 n UNION ALL SELECT 183,2603 UNION ALL SELECT 184,2604 UNION ALL SELECT 185,2605 UNION ALL SELECT 186,2606 UNION ALL SELECT 187,2607 UNION ALL SELECT 188,2608 UNION ALL SELECT 189,2609 UNION ALL SELECT 193,192)"
# same person: same code and same first name (keeps branch accounts that reuse a code out)
SAME="n.emp_code = o.emp_code AND SUBSTRING_INDEX(TRIM(n.employee),' ',1) = SUBSTRING_INDEX(TRIM(o.employee),' ',1)"

read -r -d '' COUNTS <<SQL || true
SELECT 'employees branch/sign', COUNT(*) FROM \`$N\`.employees n JOIN \`$O\`.employees o ON $SAME
  WHERE NOT (n.branch_id_fk <=> $(m "$SITE_TO_BRANCH" o.branch_id_fk)) OR NOT (BINARY n.emp_sign <=> BINARY $(m "$SITE_TO_BRANCH_TEXT" o.emp_sign));
SELECT 'punch branch', COUNT(*) FROM \`$N\`.tbl_hdoor_emps n JOIN \`$O\`.tbl_hdoor_emps o ON o.hodoor_id = n.hodoor_id
  WHERE NOT (n.branch_id_fk <=> $(m "$SITE_TO_BRANCH" o.branch_id_fk));
SELECT 'punch member_id', COUNT(*) FROM \`$N\`.tbl_hdoor_emps n JOIN $ID_MAP x ON x.o = n.member_id WHERE n.hodoor_id < 1000000;
SELECT 'punch history member_id', COUNT(*) FROM \`$N\`.tbl_hdoor_emps_history n JOIN $ID_MAP x ON x.o = n.member_id WHERE n.hodoor_id < 1000000;
SELECT 'swap branch', COUNT(*) FROM \`$N\`.tbl_emps_shef_edafi n JOIN \`$O\`.tbl_emps_shef_edafi o ON o.id = n.id
  WHERE NOT (n.branch_id_fk <=> $(m "$SITE_TO_BRANCH_KEEP0" o.branch_id_fk));
SELECT 'swap emp_id', COUNT(*) FROM \`$N\`.tbl_emps_shef_edafi n JOIN $ID_MAP x ON x.o = n.emp_id_fk WHERE n.id < 1000000;
SELECT 'extra-hours branch', COUNT(*) FROM \`$N\`.tbl_emps_hours_edafi n JOIN \`$O\`.tbl_emps_hours_edafi o ON o.id = n.id
  WHERE NOT (n.branch_id_fk <=> $(m "$SITE_TO_BRANCH_KEEP0" o.branch_id_fk));
SELECT 'extra-hours emp_id', COUNT(*) FROM \`$N\`.tbl_emps_hours_edafi n JOIN $ID_MAP x ON x.o = n.emp_id_fk WHERE n.id < 1000000;
SELECT 'shift assignment branch', COUNT(*) FROM \`$N\`.tbl_hdoor_dawms_emps n JOIN \`$O\`.tbl_hdoor_dawms_emps o ON o.id = n.id
  WHERE NOT (BINARY n.branch_id_fk <=> BINARY $(m "$SITE_TO_BRANCH_TEXT" o.branch_id_fk));
SELECT 'shift assignment emp_id', COUNT(*) FROM \`$N\`.tbl_hdoor_dawms_emps n JOIN $ID_MAP x ON x.o = n.emp_id_fk WHERE n.id < 1000000;
SELECT 'missing employee هبه (code 189)', COUNT(*) FROM \`$O\`.employees o WHERE o.id = 190 AND NOT EXISTS (SELECT 1 FROM \`$N\`.employees n WHERE n.id = 190);
SQL

echo "=== rows that will change"
mysql --batch --skip-column-names -e "$COUNTS"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

BACKUP="$APP/tmp/hr-branch-id-fix-backup-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" employees tbl_hdoor_emps tbl_hdoor_emps_history tbl_emps_shef_edafi tbl_emps_hours_edafi tbl_hdoor_dawms_emps | gzip > "$BACKUP"
echo "backup: $BACKUP"

emp_cols=$(q "SET SESSION group_concat_max_len=100000; SELECT GROUP_CONCAT(CONCAT('\`',n.column_name,'\`') ORDER BY n.ordinal_position) FROM information_schema.columns n JOIN information_schema.columns o ON o.table_schema='$O' AND o.table_name=n.table_name AND o.column_name=n.column_name WHERE n.table_schema='$N' AND n.table_name='employees'" | tail -1)
emp_sel=$(printf '%s' "$emp_cols" | sed 's/`\([^`]*\)`/o.`\1`/g')

mysql <<SQL
START TRANSACTION;
UPDATE \`$N\`.employees n JOIN \`$O\`.employees o ON $SAME
  SET n.branch_id_fk = $(m "$SITE_TO_BRANCH" o.branch_id_fk), n.emp_sign = $(m "$SITE_TO_BRANCH_TEXT" o.emp_sign);
INSERT INTO \`$N\`.employees ($emp_cols) SELECT $emp_sel FROM \`$O\`.employees o
  WHERE o.id = 190 AND NOT EXISTS (SELECT 1 FROM \`$N\`.employees n WHERE n.id = 190);
UPDATE \`$N\`.employees SET branch_id_fk = $(m "$SITE_TO_BRANCH" branch_id_fk), emp_sign = $(m "$SITE_TO_BRANCH_TEXT" emp_sign) WHERE id = 190;
UPDATE \`$N\`.tbl_hdoor_emps n JOIN \`$O\`.tbl_hdoor_emps o ON o.hodoor_id = n.hodoor_id
  SET n.branch_id_fk = $(m "$SITE_TO_BRANCH" o.branch_id_fk);
UPDATE \`$N\`.tbl_hdoor_emps n JOIN $ID_MAP x ON x.o = n.member_id SET n.member_id = x.n WHERE n.hodoor_id < 1000000;
UPDATE \`$N\`.tbl_hdoor_emps_history n JOIN $ID_MAP x ON x.o = n.member_id SET n.member_id = x.n WHERE n.hodoor_id < 1000000;
UPDATE \`$N\`.tbl_emps_shef_edafi n JOIN \`$O\`.tbl_emps_shef_edafi o ON o.id = n.id
  SET n.branch_id_fk = $(m "$SITE_TO_BRANCH_KEEP0" o.branch_id_fk);
UPDATE \`$N\`.tbl_emps_shef_edafi n JOIN $ID_MAP x ON x.o = n.emp_id_fk SET n.emp_id_fk = x.n WHERE n.id < 1000000;
UPDATE \`$N\`.tbl_emps_hours_edafi n JOIN \`$O\`.tbl_emps_hours_edafi o ON o.id = n.id
  SET n.branch_id_fk = $(m "$SITE_TO_BRANCH_KEEP0" o.branch_id_fk);
UPDATE \`$N\`.tbl_emps_hours_edafi n JOIN $ID_MAP x ON x.o = n.emp_id_fk SET n.emp_id_fk = x.n WHERE n.id < 1000000;
UPDATE \`$N\`.tbl_hdoor_dawms_emps n JOIN \`$O\`.tbl_hdoor_dawms_emps o ON o.id = n.id
  SET n.branch_id_fk = $(m "$SITE_TO_BRANCH_TEXT" o.branch_id_fk);
UPDATE \`$N\`.tbl_hdoor_dawms_emps n JOIN $ID_MAP x ON x.o = n.emp_id_fk SET n.emp_id_fk = x.n WHERE n.id < 1000000;
COMMIT;
SQL
echo "=== after (should all be 0 except the employee insert line)"
mysql --batch --skip-column-names -e "$COUNTS"
echo "HR BRANCH/ID FIX APPLIED"
echo "undo: zcat $BACKUP | mysql $N"
