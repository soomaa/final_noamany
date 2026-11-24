#!/usr/bin/env bash
# Staff accounts that came from the old HR system and cannot use the new system (Nada, 5-7 Nov):
#   - the account is disabled (users.approved = 0, copied from the old HR system) although the employee is
#     active → login falls through to member login and says "رقم الهاتف غير صحيح" (عبدالرحمن مجدي);
#   - the account has no RBAC role, or only the legacy `employee` role (الأذونات/الإجازات), so the sidebar
#     shows "الموارد البشرية" only (محمد عبدالمنعم سليمان, reception accounts);
#   - the employee has a job title as text only (mosma_wazefy_n) and no mosma_wazefy_code, so no job-title
#     role can be resolved;
#   - an account is linked to a removed duplicate of the same employee (فرع البر الشرقي, 01099913601) → login
#     says the linked file is inactive.
#
# Run ON THE SERVER as root:
#   bash fix-hr-accounts.sh            # dry run: lists every change
#   APPLY=1 bash fix-hr-accounts.sh    # backs up employees, users, rbac_user_roles, then writes in one transaction
#
# Rules (nothing is guessed):
#   1. Job code from the text title only for an exact job name or these aliases:
#      كابتن→كابتن, ريسيبشن→موظف ريسيبشن, hk→عامل خدمات, بار→موظف بار. Text stays as it is.
#   2. A disabled account is enabled only when its employee is active, the account name is the employee's
#      name, and that employee has no enabled account yet (one account per person: the one whose username
#      is the employee's phone, otherwise the newest).
#   3. The job-title role is ADDED (the legacy `employee` role stays, it carries الأذونات/الإجازات) for
#      enabled accounts of active employees with a job code, when the account has no role other than
#      `employee` and was not removed from the system (role_id_fk not NULL).
#   0. "Active" = active here AND not suspended/removed in the old HR system (noamanycenter_hr).
#   4. Relink only account 375 (فرع البر الشرقي) from removed file 2598 to active file 2610: same name, same phone.
# Not touched (listed for HR): active employees without a job title, accounts whose name is another person,
# the انس مصطفي duplicate (one file suspended, one active), employees without any account.
set -euo pipefail
DB="${DB:-noamanycenter_nest}"
OLD="${OLD_DB:-noamanycenter_hr}"   # old HR system: an employee suspended there is not enabled here
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
MYSQL=(mysql --default-character-set=utf8mb4 "$DB")

# Active here AND not suspended/removed in the old HR system (the two disagree for a few people).
ACTIVE="IFNULL(e.employee_type,1)=1 AND IFNULL(e.leave_emp,0)<>1
  AND NOT EXISTS (SELECT 1 FROM \`$OLD\`.employees o WHERE o.emp_code=e.emp_code AND (o.employee_type=2 OR o.leave_emp=1))"
ACTIVE_HERE="IFNULL(e.employee_type,1)=1 AND IFNULL(e.leave_emp,0)<>1"
JOBMAP="COALESCE(
  (SELECT j.id FROM department_jobs j WHERE TRIM(j.name)=TRIM(e.mosma_wazefy_n) ORDER BY j.id LIMIT 1),
  CASE TRIM(e.mosma_wazefy_n) WHEN 'ريسيبشن' THEN 70 WHEN 'hk' THEN 71 WHEN 'بار' THEN 72 END)"

echo "== 1. المسمى الوظيفي: كود من الاسم المكتوب"
"${MYSQL[@]}" -e "
  SELECT e.id, e.employee, CONCAT('[',e.mosma_wazefy_n,']') AS text_title, $JOBMAP AS job_id,
         (SELECT name FROM department_jobs WHERE id = $JOBMAP) AS job_name
  FROM employees e
  WHERE $ACTIVE AND (e.mosma_wazefy_code IS NULL OR e.mosma_wazefy_code=0) AND $JOBMAP IS NOT NULL
  ORDER BY job_id, e.id"

echo "== 4. ربط الحساب 375 بملف الموظف النشط"
"${MYSQL[@]}" -e "
  SELECT u.user_id, u.username, u.name, u.emp_code AS now_linked, a.id AS active_file, a.employee
  FROM users u JOIN employees a ON a.id=2610
  WHERE u.user_id=375 AND u.emp_code=2598 AND TRIM(a.employee)=TRIM(u.name) AND a.phone=u.username"

# Candidate per active employee for step 2 (computed after step 4 in the transaction).
ENABLE_PICK="
  SELECT e.id AS emp_id,
         COALESCE(MAX(CASE WHEN u.username=e.phone THEN u.user_id END), MAX(u.user_id)) AS user_id
  FROM employees e JOIN users u ON u.emp_code=e.id AND u.approved=0 AND TRIM(u.name)=TRIM(e.employee)
  WHERE $ACTIVE
    AND NOT EXISTS (SELECT 1 FROM users x WHERE x.emp_code=e.id AND x.approved=1)
  GROUP BY e.id"
echo "== 2. تفعيل حسابات موقوفة لموظفين نشطين"
"${MYSQL[@]}" -e "
  SELECT p.user_id, u.username, u.name, e.branch_id_fk AS branch, e.mosma_wazefy_n AS title
  FROM ($ENABLE_PICK) p JOIN users u ON u.user_id=p.user_id JOIN employees e ON e.id=p.emp_id
  ORDER BY e.branch_id_fk, u.name"

ROLE_PICK="
  SELECT u.user_id, r.id AS role_id
  FROM users u
  JOIN employees e ON e.id=u.emp_code
  JOIN rbac_roles r ON r.key = CONCAT('job_title_', COALESCE(NULLIF(e.mosma_wazefy_code,0), $JOBMAP))
  WHERE $ACTIVE AND u.approved=1 AND u.role_id_fk IS NOT NULL AND TRIM(u.name)=TRIM(e.employee)
    AND NOT EXISTS (SELECT 1 FROM rbac_user_roles ur JOIN rbac_roles x ON x.id=ur.role_id
                    WHERE ur.user_id=u.user_id AND x.key<>'employee')"
echo "== 3. إضافة صلاحيات المسمى الوظيفي (قبل التفعيل؛ الحسابات اللي هتتفعل في 2 بتاخدها برضه)"
"${MYSQL[@]}" -e "
  SELECT u.user_id, u.username, u.name, r.name_ar AS role
  FROM users u
  JOIN employees e ON e.id=u.emp_code
  JOIN rbac_roles r ON r.key = CONCAT('job_title_', COALESCE(NULLIF(e.mosma_wazefy_code,0), $JOBMAP))
  WHERE $ACTIVE AND u.role_id_fk IS NOT NULL AND TRIM(u.name)=TRIM(e.employee)
    AND (u.approved=1 OR u.user_id IN (SELECT user_id FROM ($ENABLE_PICK) p))
    AND NOT EXISTS (SELECT 1 FROM rbac_user_roles ur JOIN rbac_roles x ON x.id=ur.role_id
                    WHERE ur.user_id=u.user_id AND x.key<>'employee')
  ORDER BY r.name_ar, u.name"

echo "== للعرض على الموارد البشرية (مافيش تغيير)"
echo "-- موظفين نشطين من غير مسمى وظيفي يتعرف (حساباتهم هتفضل على الإجازات/الأذونات بس):"
"${MYSQL[@]}" -e "
  SELECT e.id, e.employee, e.branch_id_fk AS branch, CONCAT('[',IFNULL(e.mosma_wazefy_n,''),']') AS text_title
  FROM employees e WHERE $ACTIVE AND (e.mosma_wazefy_code IS NULL OR e.mosma_wazefy_code=0) AND $JOBMAP IS NULL
  ORDER BY e.branch_id_fk, e.employee"
echo "-- حسابات مربوطة بملف موظف نشط واسمها اسم شخص تاني:"
"${MYSQL[@]}" -e "
  SELECT u.user_id, u.username, u.name AS account_name, e.id AS emp_id, e.employee, u.approved
  FROM users u JOIN employees e ON e.id=u.emp_code
  WHERE $ACTIVE AND u.level<>1 AND TRIM(u.name)<>TRIM(e.employee)"
echo "-- نشط هنا وموقوف في السيستم القديم (الحساب فضل موقوف؛ الموارد البشرية تقرر):"
"${MYSQL[@]}" -e "
  SELECT e.id, e.employee, e.branch_id_fk AS branch, o.employee_type AS old_type, o.leave_emp AS old_leave
  FROM employees e JOIN \`$OLD\`.employees o ON o.emp_code=e.emp_code
  WHERE $ACTIVE_HERE AND (o.employee_type=2 OR o.leave_emp=1)
  ORDER BY e.branch_id_fk, e.employee"
echo "-- موظفين نشطين من غير أي حساب:"
"${MYSQL[@]}" -e "
  SELECT e.id, e.employee, e.phone, e.branch_id_fk AS branch FROM employees e
  WHERE $ACTIVE AND NOT EXISTS (SELECT 1 FROM users u WHERE u.emp_code=e.id)"

if [ "${APPLY:-}" != 1 ]; then echo "dry run — run again with APPLY=1 to write"; exit 0; fi

mkdir -p "$APP/tmp"
backup="$APP/tmp/before-hr-accounts-fix-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$DB" employees users rbac_user_roles | gzip > "$backup"
[ -s "$backup" ] || { echo "!! backup failed — nothing written"; exit 1; }
echo "backup: $backup"

"${MYSQL[@]}" -e "
START TRANSACTION;
UPDATE users u JOIN employees a ON a.id=2610
  SET u.emp_code=2610
  WHERE u.user_id=375 AND u.emp_code=2598 AND TRIM(a.employee)=TRIM(u.name) AND a.phone=u.username;
UPDATE employees e SET e.mosma_wazefy_code = $JOBMAP
  WHERE $ACTIVE AND (e.mosma_wazefy_code IS NULL OR e.mosma_wazefy_code=0) AND $JOBMAP IS NOT NULL;
CREATE TEMPORARY TABLE fix_enable AS $ENABLE_PICK;
UPDATE users u JOIN fix_enable f ON f.user_id=u.user_id SET u.approved=1;
CREATE TEMPORARY TABLE fix_roles AS $ROLE_PICK;
INSERT IGNORE INTO rbac_user_roles (user_id, role_id, created_at) SELECT user_id, role_id, NOW(3) FROM fix_roles;
UPDATE users u JOIN fix_roles f ON f.user_id=u.user_id SET u.role_id_fk=f.role_id;
SELECT (SELECT COUNT(*) FROM fix_enable) AS enabled, (SELECT COUNT(*) FROM fix_roles) AS roles_added;
COMMIT;"
echo "rollback: gunzip < $backup | mysql $DB"
