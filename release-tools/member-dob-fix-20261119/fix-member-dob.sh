#!/usr/bin/env bash
# Birth dates the member import left empty (Nada/Fatma, 18 Nov: "لا يمكن تحديد عمر العضو" on student plans).
# The old system (noamanycenter_noamany.tbl_members.birth_date, varchar) stored them in several forms; the
# import copied only yyyy-mm-dd, so these came over as NULL:
#   - Unix seconds, also negative (before 1970), saved at midnight UTC+3 or at midnight UTC;
#   - dd-mm-yyyy / dd/mm/yyyy, also with Arabic digits (١٢-١-٢٠٢٠).
# This fills ONLY empty new birth dates (club_members.date_of_birth IS NULL) of members that came from the
# old system (same member code), and only with a real date between 1925 and 2024 (1970-01-01, the old
# "empty" value, is skipped). Nothing that has a birth date is touched.
#
# Run ON THE SERVER as root:
#   bash fix-member-dob.sh            # dry run: counts and samples
#   APPLY=1 bash fix-member-dob.sh    # saves (id, date_of_birth) of all members to a backup table, then writes
set -euo pipefail
O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
MYSQL=(mysql --default-character-set=utf8mb4)

# Arabic-Indic digits -> ASCII
ASCII="REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(o.birth_date),
  '٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9')"
SECS="CAST(TRIM(o.birth_date) AS SIGNED)"
PARSED="CASE
  WHEN TRIM(o.birth_date) REGEXP '^-?[0-9]{5,}\$' THEN
    CASE WHEN MOD($SECS, 86400) = 0 THEN DATE(DATE_ADD('1970-01-01', INTERVAL $SECS SECOND))
         ELSE DATE(DATE_ADD('1970-01-01', INTERVAL $SECS + 10800 SECOND)) END
  WHEN $ASCII REGEXP '^[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}\$' THEN
    STR_TO_DATE(REPLACE($ASCII, '/', '-'), '%d-%m-%Y')
  WHEN $ASCII REGEXP '^[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}\$' THEN
    STR_TO_DATE(REPLACE($ASCII, '/', '-'), '%Y-%m-%d')
END"
CANDIDATES="
  SELECT n.id, n.member_code, o.birth_date AS old_value, $PARSED AS dob
  FROM \`$N\`.club_members n
  JOIN \`$O\`.tbl_members o ON o.m_code = n.member_code
  WHERE n.date_of_birth IS NULL"
VALID="dob IS NOT NULL AND dob BETWEEN '1925-01-01' AND '2024-12-31' AND dob <> '1970-01-01'"

echo "== members with an empty birth date in the new system"
"${MYSQL[@]}" -e "SELECT COUNT(*) AS empty_now FROM \`$N\`.club_members WHERE date_of_birth IS NULL AND is_deleted = 0"
echo "== recoverable from the old system"
"${MYSQL[@]}" -e "SELECT SUM($VALID) AS will_fill, SUM(NOT ($VALID) OR dob IS NULL) AS left_empty FROM ($CANDIDATES) c"
echo "== samples (old value -> new birth date)"
"${MYSQL[@]}" -e "SELECT member_code, old_value, DATE_FORMAT(dob,'%Y-%m-%d') AS dob FROM ($CANDIDATES) c WHERE $VALID ORDER BY RAND() LIMIT 12"
echo "== still empty after this (old value unreadable or not a real date), by kind"
"${MYSQL[@]}" -e "SELECT CASE WHEN old_value IS NULL OR TRIM(old_value) IN ('','0') THEN 'empty in old too'
                         WHEN dob IS NULL THEN 'unreadable' ELSE 'outside 1925-2024 / 1970-01-01' END AS why, COUNT(*) n
                  FROM ($CANDIDATES) c WHERE NOT ($VALID) OR dob IS NULL GROUP BY why"

if [ "${APPLY:-}" != 1 ]; then echo "dry run — run again with APPLY=1 to write"; exit 0; fi

backup="club_members_dob_backup_$(date +%Y%m%d%H%M%S)"
"${MYSQL[@]}" "$N" -e "CREATE TABLE \`$backup\` AS SELECT id, date_of_birth FROM club_members"
echo "backup table: $N.$backup"
"${MYSQL[@]}" -e "
START TRANSACTION;
UPDATE \`$N\`.club_members m JOIN ($CANDIDATES) c ON c.id = m.id
  SET m.date_of_birth = DATE_FORMAT(c.dob, '%Y-%m-%d')
  WHERE m.date_of_birth IS NULL AND $VALID;
SELECT ROW_COUNT() AS filled;
COMMIT;"
echo "rollback: UPDATE $N.club_members m JOIN $N.$backup b ON b.id = m.id SET m.date_of_birth = b.date_of_birth WHERE m.date_of_birth <=> b.date_of_birth = 0;"
