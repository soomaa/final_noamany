#!/usr/bin/env bash
# One-way sync: old HR system (noamanycenter_hr, still used by the mobile app at hr.noamanycenter.com)
# -> new system (noamanycenter_nest), so punches, leave, permissions, shift swaps and extra hours
# recorded in the old system show up in the new screens and reports with every column as-is.
# Also copies shift definitions/assignments and weekly off days, which the new punch logic reads.
#
# Runs as root from cron every few minutes (install-legacy-hr-sync.sh sets that up).
# Rows are copied by primary key with all columns (both schemas have the same columns).
# Rows created in the new system use ids >= NATIVE_FROM, so the two systems never share an id.
# A new-system row that has the same id as an old row but a different employee/date is never
# overwritten; it is reported as CONFLICT in the log instead.
#
# Two translations are applied on the way (same as fix-hr-branches-and-ids.sh):
# - branch numbers: the old system numbers places by tbl_sites (1 = البر الشرقي, 2 = الجلاء,
#   3 = طنطا, 0 = none); the new branches are 2 = طنطا, 3 = البر الشرقي, 4 = الجلاء;
# - employee ids: people added separately in both systems keep the id the new system uses;
# - user ids: old accounts 369-402 clash with new accounts; see fix-hr-users.sh for the mapping.
set -euo pipefail

OLD="${OLD_DB:-noamanycenter_hr}"
NEW="${NEW_DB:-noamanycenter_nest}"
NATIVE_FROM=1000000
# Tables the mobile app writes to through the old system (besides attendance, leave and permissions).
APP_TABLES="hr_ta3mem_personal_msg hr_ta3mem_personal_msg_details hr_ta3mem_details hr_enzarat hr_lawyeh_files_seens hr_dialy_reports hr_talabat_orders hr_mobadrat hr_ansheta hr_ansheta_files hr_locations_visits tbl_emp_zeyarat hr_mosalat tbl_notifications hr_alert_items_emps hr_all_agzat_history hr_all_ozonat_history hr_entdab hr_solaf hr_solaf_files emp_evaluation emp_evaluation_details hr_ta3en_moaqt_evaluation hr_ta3en_moaqt_evaluation_details"
LOG="${SYNC_LOG:-/home/noamanycenter/final.noamanycenter.com/tmp/legacy-hr-sync.log}"

exec 9>"${SYNC_LOCK:-/run/lock/legacy-hr-sync.lock}"
flock -n 9 || exit 0

q() { mysql --batch --skip-column-names -e "$1"; }

site_to_branch() { echo "CASE $1 WHEN 0 THEN 3 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 3 THEN 2 ELSE $1 END"; }
site_to_branch_keep0() { echo "CASE $1 WHEN 1 THEN 3 WHEN 2 THEN 4 WHEN 3 THEN 2 ELSE $1 END"; }
site_to_branch_text() { echo "CASE TRIM($1) WHEN '1' THEN '3' WHEN '2' THEN '4' WHEN '3' THEN '2' ELSE $1 END"; }
# old employee id -> id the new system uses for the same person
# old user id -> account in the new system (fix-hr-users.sh added the rest at 1000000 + id)
user_id() { echo "CASE $1 WHEN 375 THEN 374 WHEN 377 THEN 376 WHEN 391 THEN 379 WHEN 392 THEN 380 WHEN 393 THEN 381 WHEN 394 THEN 382 WHEN 395 THEN 383 WHEN 396 THEN 384 WHEN 397 THEN 385 WHEN 398 THEN 386 ELSE CASE WHEN $1 IN (369,370,371,372,373,374,376,378,379,380,381,382,383,384,385,386,387,388) THEN $1 + 1000000 ELSE $1 END END"; }
emp_id() { echo "CASE $1 WHEN 182 THEN 2602 WHEN 183 THEN 2603 WHEN 184 THEN 2604 WHEN 185 THEN 2605 WHEN 186 THEN 2606 WHEN 187 THEN 2607 WHEN 188 THEN 2608 WHEN 189 THEN 2609 WHEN 193 THEN 192 ELSE $1 END"; }

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

# Comma-separated, back-quoted list of the columns both tables have, in the new table's order.
common_cols() {
  q "SET SESSION group_concat_max_len = 1000000;
     SELECT GROUP_CONCAT(CONCAT('\`', n.column_name, '\`') ORDER BY n.ordinal_position)
     FROM information_schema.columns n
     JOIN information_schema.columns o
       ON o.table_schema = '$OLD' AND o.table_name = n.table_name AND o.column_name = n.column_name
     WHERE n.table_schema = '$NEW' AND n.table_name = '$1'"
}

# upsert <table> <pk> <identity condition on o/n> <extra old-row filter> [column=expression ...]
#   identity: what must match for an existing new row to be treated as the same record.
#   column=expression: copy that column through a translation instead of as-is.
upsert() {
  local t="$1" pk="$2" same="$3" filter="$4" cols sel upd override col
  shift 4
  cols=$(common_cols "$t")
  sel=$(printf '%s' "$cols" | sed 's/`\([^`]*\)`/o.`\1`/g')
  for override in "$@"; do
    col="${override%%=*}"
    sel="${sel//o.\`$col\`/${override#*=} AS \`$col\`}"
  done
  upd=$(printf '%s' "$cols" | tr ',' '\n' | grep -v "^\`$pk\`\$" | sed 's/.*/&=src.&/' | paste -sd, -)
  local conflicts
  conflicts=$(q "SELECT COUNT(*) FROM \`$OLD\`.\`$t\` o JOIN \`$NEW\`.\`$t\` n ON n.\`$pk\` = o.\`$pk\` WHERE NOT ($same)")
  [ "$conflicts" = 0 ] || log "CONFLICT $t: $conflicts row(s) share an id with a different record in the new system; left untouched"
  q "INSERT INTO \`$NEW\`.\`$t\` ($cols)
     SELECT * FROM (
       SELECT $sel FROM \`$OLD\`.\`$t\` o
       LEFT JOIN \`$NEW\`.\`$t\` n ON n.\`$pk\` = o.\`$pk\`
       WHERE o.\`$pk\` < $NATIVE_FROM AND (n.\`$pk\` IS NULL OR ($same)) AND ($filter)
     ) AS src
     ON DUPLICATE KEY UPDATE $upd;
     SELECT ROW_COUNT();"
}

# Translations for a table chosen by column name: user ids (publisher, *_user_id, from_user/to_user,
# user_id_fk) and employee ids (emp_id, emp_id_fk, *_emp_id, member_id). Prints one
# "column=expression" per line for upsert().
id_overrides() {
  local c
  for c in $(q "SELECT n.column_name FROM information_schema.columns n JOIN information_schema.columns o
                ON o.table_schema = '$OLD' AND o.table_name = n.table_name AND o.column_name = n.column_name
                WHERE n.table_schema = '$NEW' AND n.table_name = '$1' AND n.data_type IN ('int','bigint','smallint','mediumint')"); do
    case "$c" in
      publisher|from_user|to_user|user_id_fk|*_user_id|emp_user_id) echo "$c=$(user_id "o.$c")" ;;
      emp_id|emp_id_fk|*_emp_id|member_id) echo "$c=$(emp_id "o.$c")" ;;
    esac
  done
}

# Whole-table copy for the smaller app tables (messages, regulations read, tasks, requests, ...):
# same ids, translated user/employee ids, deletions mirrored.
copy_table() {
  local t="$1" overrides=()
  mapfile -t overrides < <(id_overrides "$t")
  add "$t" "$(upsert "$t" id "1" "1" "${overrides[@]}")"
  add "${t}_del" "$(mirror_deletes "$t" id)"
}

# Old-system rows deleted there (pk < NATIVE_FROM) are deleted in the new system too.
mirror_deletes() {
  local t="$1" pk="$2"
  q "USE \`$NEW\`;
     DELETE n FROM \`$NEW\`.\`$t\` n
     LEFT JOIN \`$OLD\`.\`$t\` o ON o.\`$pk\` = n.\`$pk\`
     WHERE n.\`$pk\` < $NATIVE_FROM AND o.\`$pk\` IS NULL;
     SELECT ROW_COUNT();"
}

summary=""
add() { summary="$summary $1=$2"; }

# Punches: new rows plus anything in the last 40 days (check-outs and corrections update old rows).
add hdoor "$(upsert tbl_hdoor_emps hodoor_id \
  "o.member_code <=> n.member_code AND BINARY o.action_date <=> BINARY n.action_date" \
  "n.hodoor_id IS NULL OR o.action_date >= DATE_FORMAT(CURDATE() - INTERVAL 40 DAY, '%Y-%m-%d')" \
  "branch_id_fk=$(site_to_branch o.branch_id_fk)" "member_id=$(emp_id o.member_id)" \
  "hdoor_user_id=$(user_id o.hdoor_user_id)" "ensraf_user_id=$(user_id o.ensraf_user_id)")"
# Punch history is append-only.
add history "$(upsert tbl_hdoor_emps_history hodoor_id \
  "o.member_code <=> n.member_code" "n.hodoor_id IS NULL" "member_id=$(emp_id o.member_id)")"
# Small tables: full copy every run (status changes, approvals, edits), deletions mirrored.
add agzat "$(upsert hr_all_agzat_orders id "o.emp_code_fk <=> n.emp_code_fk" "1" "emp_id_fk=$(emp_id o.emp_id_fk)" \
  "publisher=$(user_id o.publisher)" "emp_user_id=$(user_id o.emp_user_id)" \
  "current_from_user_id=$(user_id o.current_from_user_id)" "current_to_user_id=$(user_id o.current_to_user_id)")"
add agzat_del "$(mirror_deletes hr_all_agzat_orders id)"
add ozonat "$(upsert hr_all_ozonat_orders id "o.emp_code_fk <=> n.emp_code_fk" "1" "emp_id_fk=$(emp_id o.emp_id_fk)" \
  "publisher=$(user_id o.publisher)" "emp_user_id=$(user_id o.emp_user_id)" \
  "current_from_user_id=$(user_id o.current_from_user_id)" "current_to_user_id=$(user_id o.current_to_user_id)")"
add ozonat_del "$(mirror_deletes hr_all_ozonat_orders id)"
add swaps "$(upsert tbl_emps_shef_edafi id \
  "o.emp_code_fk <=> n.emp_code_fk AND BINARY o.sheft_date <=> BINARY n.sheft_date" "1" \
  "branch_id_fk=$(site_to_branch_keep0 o.branch_id_fk)" "emp_id_fk=$(emp_id o.emp_id_fk)" "publisher=$(user_id o.publisher)")"
add swaps_del "$(mirror_deletes tbl_emps_shef_edafi id)"
add hours "$(upsert tbl_emps_hours_edafi id \
  "o.emp_code_fk <=> n.emp_code_fk AND BINARY o.edafa_date <=> BINARY n.edafa_date" "1" \
  "branch_id_fk=$(site_to_branch_keep0 o.branch_id_fk)" "emp_id_fk=$(emp_id o.emp_id_fk)" "publisher=$(user_id o.publisher)")"
add hours_del "$(mirror_deletes tbl_emps_hours_edafi id)"
add offdays "$(upsert hr_emp_agazat_dayes id "o.emp_code_fk <=> n.emp_code_fk" "1")"
add offdays_del "$(mirror_deletes hr_emp_agazat_dayes id)"
# Shift definitions and employee-to-shift assignments: the new punch logic reads these.
add shifts "$(upsert tbl_hdodr_setting id "BINARY o.title <=> BINARY n.title" "1")"
add shifts_del "$(mirror_deletes tbl_hdodr_setting id)"
add shift_assign "$(upsert tbl_hdoor_dawms_emps id "$(emp_id o.emp_id_fk) <=> n.emp_id_fk" "1" \
  "branch_id_fk=$(site_to_branch_text o.branch_id_fk)" "emp_id_fk=$(emp_id o.emp_id_fk)")"
add shift_assign_del "$(mirror_deletes tbl_hdoor_dawms_emps id)"

# Everything else the mobile app writes in the old system.
for t in $APP_TABLES; do copy_table "$t"; done

# Employees added in the old system: insert the ones the new system does not have (by emp_code),
# keeping the old id when it is free. Existing employees are never changed (HR edits them in the new system).
emp_cols=$(common_cols employees)
emp_sel=$(printf '%s' "$emp_cols" | sed 's/`\([^`]*\)`/o.`\1`/g')
emp_sel="${emp_sel//o.\`branch_id_fk\`/$(site_to_branch o.branch_id_fk) AS \`branch_id_fk\`}"
emp_sel="${emp_sel//o.\`emp_sign\`/$(site_to_branch_text o.emp_sign) AS \`emp_sign\`}"
added=$(q "INSERT INTO \`$NEW\`.employees ($emp_cols)
  SELECT $emp_sel FROM \`$OLD\`.employees o
  WHERE o.emp_code IS NOT NULL
    AND o.id = (SELECT MIN(o2.id) FROM \`$OLD\`.employees o2 WHERE o2.emp_code = o.emp_code)
    AND NOT EXISTS (SELECT 1 FROM \`$NEW\`.employees n WHERE n.emp_code = o.emp_code)
    AND NOT EXISTS (SELECT 1 FROM \`$NEW\`.employees n WHERE n.id = o.id);
  SELECT ROW_COUNT();")
add employees "$added"
# Same, when the old id is already taken in the new system: let the new system pick the id.
emp_cols_noid=$(printf '%s' "$emp_cols" | tr ',' '\n' | grep -v '^`id`$' | paste -sd, -)
emp_sel_noid=$(printf '%s' "$emp_cols_noid" | sed 's/`\([^`]*\)`/o.`\1`/g')
emp_sel_noid="${emp_sel_noid//o.\`branch_id_fk\`/$(site_to_branch o.branch_id_fk) AS \`branch_id_fk\`}"
emp_sel_noid="${emp_sel_noid//o.\`emp_sign\`/$(site_to_branch_text o.emp_sign) AS \`emp_sign\`}"
added=$(q "INSERT INTO \`$NEW\`.employees ($emp_cols_noid)
  SELECT $emp_sel_noid FROM \`$OLD\`.employees o
  WHERE o.emp_code IS NOT NULL
    AND o.id = (SELECT MIN(o2.id) FROM \`$OLD\`.employees o2 WHERE o2.emp_code = o.emp_code)
    AND NOT EXISTS (SELECT 1 FROM \`$NEW\`.employees n WHERE n.emp_code = o.emp_code);
  SELECT ROW_COUNT();")
add employees_newid "$added"
# The old system stores '' in yes/no columns it never filled; Prisma cannot read '' back, which breaks
# the employee screens. Same repair as 20261119-employees-empty-enum-repair.sql, every run (only '' rows).
fixed=$(q "UPDATE \`$NEW\`.employees SET
    birth_img = NULLIF(birth_img, ''), generate_qrcode = NULLIF(generate_qrcode, ''),
    military_service = NULLIF(military_service, ''), motawen = NULLIF(motawen, ''),
    person_img = NULLIF(person_img, ''), phesh_genai = NULLIF(phesh_genai, ''),
    qualification_img = NULLIF(qualification_img, ''), rokhsa_mihani = NULLIF(rokhsa_mihani, ''),
    show_in_mosayer = NULLIF(show_in_mosayer, ''), show_in_tamen = NULLIF(show_in_tamen, ''),
    tasken_type = NULLIF(tasken_type, ''),
    remove_basma = IF(remove_basma = '', 'no', remove_basma), shahadt_jaish = IF(shahadt_jaish = '', 'no', shahadt_jaish)
  WHERE '' IN (birth_img, generate_qrcode, military_service, motawen, person_img, phesh_genai, qualification_img,
               rokhsa_mihani, show_in_mosayer, show_in_tamen, tasken_type, remove_basma, shahadt_jaish);
  SELECT ROW_COUNT();")
add employee_blank_fix "$fixed"
# Branch moves in the old system follow to the same person (same code and first name; branch
# accounts that reuse an employee code in the new system are left alone).
moved=$(q "UPDATE \`$NEW\`.employees n JOIN \`$OLD\`.employees o
    ON n.emp_code = o.emp_code AND SUBSTRING_INDEX(TRIM(n.employee),' ',1) = SUBSTRING_INDEX(TRIM(o.employee),' ',1)
  SET n.branch_id_fk = $(site_to_branch o.branch_id_fk), n.emp_sign = $(site_to_branch_text o.emp_sign);
  SELECT ROW_COUNT();")
add employee_branches "$moved"

# New employees whose job title came as text only get the job-title code (exact job name, or the
# aliases ريسيبشن / hk / بار), so a role can be resolved for them. Only empty codes are filled.
# Aliases are looked up by the job's NAME: the 19 Nov roles update replaced job ids 70 (ريسيبشن) and
# 72 (بار) with new ones, and a fixed id would point new staff at a job (and role) that no longer exists.
jobid() { printf '(SELECT MIN(j2.id) FROM `%s`.department_jobs j2 WHERE TRIM(j2.name) = '"'"'%s'"'"')' "$NEW" "$1"; }
jobmap="COALESCE(
  (SELECT j.id FROM \`$NEW\`.department_jobs j WHERE TRIM(j.name) = TRIM(n.mosma_wazefy_n) ORDER BY j.id LIMIT 1),
  CASE TRIM(n.mosma_wazefy_n)
    WHEN 'ريسيبشن' THEN $(jobid 'ريسبشن') WHEN 'ريسبشن' THEN $(jobid 'ريسبشن') WHEN 'موظف ريسيبشن' THEN $(jobid 'ريسبشن')
    WHEN 'hk' THEN $(jobid 'عامل خدمات')
    WHEN 'بار' THEN $(jobid 'بار') WHEN 'موظف بار' THEN $(jobid 'بار')
  END)"
coded=$(q "UPDATE \`$NEW\`.employees n SET n.mosma_wazefy_code = $jobmap
  WHERE (n.mosma_wazefy_code IS NULL OR n.mosma_wazefy_code = 0) AND $jobmap IS NOT NULL;
  SELECT ROW_COUNT();")
add job_codes "$coded"

# Accounts created later in the old system (no clash: the new system's own accounts are 1,000,000+).
user_cols=$(common_cols users)
user_sel=$(printf '%s' "$user_cols" | sed 's/`\([^`]*\)`/o.`\1`/g')
user_sel="${user_sel//o.\`emp_code\`/$(emp_id o.emp_code) AS \`emp_code\`}"
new_user_filter="o.user_id < $NATIVE_FROM AND o.user_id > 402
    AND NOT EXISTS (SELECT 1 FROM \`$NEW\`.users n WHERE n.user_id = o.user_id)
    AND NOT EXISTS (SELECT 1 FROM \`$NEW\`.users n WHERE n.username = o.username)"
new_users=$(q "SELECT IFNULL(GROUP_CONCAT(o.user_id), '') FROM \`$OLD\`.users o WHERE $new_user_filter")
added=$(q "INSERT INTO \`$NEW\`.users ($user_cols) SELECT $user_sel FROM \`$OLD\`.users o
  WHERE $new_user_filter;
  SELECT ROW_COUNT();")
add users "$added"

# The old system creates staff accounts disabled (approved = 0) and the new system needs a role, so a
# just-copied account came in unusable (Nada, 5 Nov: "رقم الهاتف غير صحيح", sidebar with HR only).
# For accounts copied in THIS run only (an administrator's later changes are never undone): enable the
# account when its employee is active in both systems and it carries that employee's name, and add the
# employee's job-title role next to whatever it has.
if [ -n "$new_users" ]; then
  usable="u.user_id IN ($new_users) AND TRIM(u.name) = TRIM(e.employee)
    AND IFNULL(e.employee_type, 1) = 1 AND IFNULL(e.leave_emp, 0) <> 1
    AND NOT EXISTS (SELECT 1 FROM \`$OLD\`.employees o WHERE o.emp_code = e.emp_code AND (o.employee_type = 2 OR o.leave_emp = 1))"
  enabled=$(q "UPDATE \`$NEW\`.users u JOIN \`$NEW\`.employees e ON e.id = u.emp_code SET u.approved = 1
    WHERE $usable AND u.approved = 0;
    SELECT ROW_COUNT();")
  add users_enabled "$enabled"
  roled=$(q "INSERT IGNORE INTO \`$NEW\`.rbac_user_roles (user_id, role_id, created_at)
    SELECT u.user_id, r.id, NOW(3) FROM \`$NEW\`.users u JOIN \`$NEW\`.employees e ON e.id = u.emp_code
    JOIN \`$NEW\`.rbac_roles r ON r.key = CONCAT('job_title_', e.mosma_wazefy_code)
    WHERE $usable AND e.mosma_wazefy_code > 0;
    SELECT ROW_COUNT();")
  q "UPDATE \`$NEW\`.users u JOIN \`$NEW\`.employees e ON e.id = u.emp_code
    JOIN \`$NEW\`.rbac_roles r ON r.key = CONCAT('job_title_', e.mosma_wazefy_code)
    SET u.role_id_fk = r.id WHERE $usable AND e.mosma_wazefy_code > 0" >/dev/null
  add users_roles "$roled"
fi

log "OK$summary"
