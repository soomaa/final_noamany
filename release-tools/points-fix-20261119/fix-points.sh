#!/usr/bin/env bash
# Member points (إدارة النقاط) after the move from the old system, checked 19 Nov 2026:
#  1. Wrong member: the old system finds a member's points BY MEMBER CODE (Point_setting_model: where member_code),
#     but its tbl_points_history.member_id is often another member's id (e.g. row 500: code A19206 محمد يحى,
#     member_id 53 = A46 محمد خالد خضراوي). The import mapped points by that member_id, so 8,550 of 11,794 rows
#     in the new system sat on the wrong member, in both tbl_points_history (points screens) and
#     club_member_point_transactions (member profile and members' app). Fix: member_id = the new member whose
#     member_code is the row's member_code (the code is unique in club_members).
#  2. Missing: points the old system added after the copy (old ids above the new maximum, from 10 Oct 2026)
#     are not in the new system. Fix: copy them into both tables, same ids, member by code, plan and
#     subscription through legacy_record_mappings when known.
# Rows whose code has no member in the new system are left as they are and listed.
#
# Run ON THE SERVER as root:
#   bash fix-points.sh            # dry run
#   APPLY=1 bash fix-points.sh    # fix the member mapping only
#   APPLY=1 COPY_MISSING=1 bash fix-points.sh   # also copy the missing old rows
#   (both: first copies the three tables to *_bak_<time> tables, then writes in one transaction
set -euo pipefail
O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
MYSQL=(mysql --default-character-set=utf8mb4 "$N")
C="COLLATE utf8mb4_unicode_ci"

q() { "${MYSQL[@]}" -e "$1"; }

echo "== 1. rows on the wrong member (now)"
q "SELECT 'tbl_points_history' tbl, COUNT(*) wrong FROM tbl_points_history h JOIN club_members m ON m.member_code = h.member_code $C WHERE h.member_id <> m.id
   UNION ALL SELECT 'club_member_point_transactions', COUNT(*) FROM club_member_point_transactions t JOIN club_members m ON m.member_code = t.member_code $C WHERE t.member_id <> m.id
   UNION ALL SELECT 'tbl_points_exhausted_history', COUNT(*) FROM tbl_points_exhausted_history e JOIN club_members m ON m.member_code = e.member_code $C WHERE e.member_id <> m.id"
echo "-- rows whose member code has no member in the new system (left as they are)"
q "SELECT h.id, h.member_code, h.points FROM tbl_points_history h LEFT JOIN club_members m ON m.member_code = h.member_code $C WHERE m.id IS NULL"

MISSING="FROM \`$O\`.tbl_points_history o
  JOIN club_members m ON m.member_code = o.member_code $C
  LEFT JOIN legacy_record_mappings ps ON ps.legacy_table = 'tbl_subscription_settings' $C AND ps.target_table = 'club_subscription_types' $C AND ps.legacy_id = CAST(o.subscription_type_id_fk AS CHAR) $C
  LEFT JOIN legacy_record_mappings ms ON ms.legacy_table = 'tbl_subscription_members' $C AND ms.legacy_id = CAST(o.sub_id_fk AS CHAR) $C
  WHERE NOT EXISTS (SELECT 1 FROM tbl_points_history h WHERE h.id = o.id)
    AND NOT EXISTS (SELECT 1 FROM club_member_point_transactions t WHERE t.id = o.id)"
echo "== 2. old rows missing in the new system"
q "SELECT COUNT(*) to_copy, SUM(o.points) points, MIN(DATE(DATE_ADD('1970-01-01', INTERVAL o.time SECOND))) first_day,
          MAX(DATE(DATE_ADD('1970-01-01', INTERVAL o.time SECOND))) last_day, SUM(ps.target_id IS NULL) plan_unmapped, SUM(ms.target_id IS NULL) sub_unmapped $MISSING"
q "SELECT COUNT(*) missing_but_no_member FROM \`$O\`.tbl_points_history o LEFT JOIN club_members m ON m.member_code = o.member_code $C
   WHERE m.id IS NULL AND NOT EXISTS (SELECT 1 FROM tbl_points_history h WHERE h.id = o.id)"

if [ "${APPLY:-}" != 1 ]; then echo "dry run — run again with APPLY=1 to write"; exit 0; fi

stamp=$(date +%Y%m%d%H%M%S)
for t in tbl_points_history club_member_point_transactions tbl_points_exhausted_history; do
  q "CREATE TABLE \`${t}_bak_$stamp\` AS SELECT * FROM \`$t\`"
done
echo "backup tables: *_bak_$stamp"

COPY_SQL=""
# The missing recent points belong to members/subscriptions that are not in the new system yet
# (the old system is still in use). Copy them only with COPY_MISSING=1, normally after the gym sync.
if [ "${COPY_MISSING:-}" = 1 ]; then
COPY_SQL="INSERT INTO tbl_points_history (id, type, member_id, member_code, action_type, action_name, subscription_type_id_fk, subscription_type_n,
  points, date_added, deadline_date, deadline_date_string, date, time, publisher, sub_id_fk, deleted, is_active)
SELECT o.id, o.type, m.id, o.member_code, o.action_type, o.action_name, CAST(ps.target_id AS SIGNED), o.subscription_type_n,
  o.points, o.date_added, o.deadline_date, o.deadline_date_string, o.date, o.time, o.publisher, CAST(ms.target_id AS SIGNED), o.deleted, o.is_active
$MISSING;
SELECT ROW_COUNT() AS history_copied;
INSERT INTO club_member_point_transactions (id, member_id, source_member_id, member_code, transaction_type, action_type, action_name,
  subscription_type_id, source_subscription_type_id, subscription_id, source_subscription_id, points, occurred_at, expiry_date,
  expiry_label, created_by, is_deleted, is_active, created_at)
SELECT h.id, h.member_id, o.member_id, h.member_code, 'earn', h.action_type, h.action_name,
  h.subscription_type_id_fk, o.subscription_type_id_fk, h.sub_id_fk, IFNULL(o.sub_id_fk, 0), h.points,
  DATE_ADD('1970-01-01', INTERVAL o.time SECOND), h.deadline_date, h.deadline_date_string, NULL, h.deleted, h.is_active, NOW(3)
FROM tbl_points_history h JOIN \`$O\`.tbl_points_history o ON o.id = h.id
WHERE h.id > (SELECT MAX(id) FROM \`tbl_points_history_bak_$stamp\`)
  AND NOT EXISTS (SELECT 1 FROM club_member_point_transactions t WHERE t.id = h.id);
SELECT ROW_COUNT() AS ledger_copied;
"
fi

q "START TRANSACTION;
$COPY_SQLUPDATE tbl_points_history h JOIN club_members m ON m.member_code = h.member_code $C SET h.member_id = m.id WHERE h.member_id <> m.id;
SELECT ROW_COUNT() AS history_remapped;
UPDATE club_member_point_transactions t JOIN club_members m ON m.member_code = t.member_code $C SET t.member_id = m.id WHERE t.member_id <> m.id;
SELECT ROW_COUNT() AS ledger_remapped;
UPDATE tbl_points_exhausted_history e JOIN club_members m ON m.member_code = e.member_code $C SET e.member_id = m.id WHERE e.member_id <> m.id;
SELECT ROW_COUNT() AS redeemed_remapped;
COMMIT;"
echo "rollback (only right after): for each table, DELETE all rows and INSERT ... SELECT * FROM <table>_bak_$stamp"
