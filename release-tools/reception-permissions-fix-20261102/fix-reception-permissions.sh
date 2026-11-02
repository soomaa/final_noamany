#!/usr/bin/env bash
# Reception permissions from Nada (2 Nov), for the reception job-title roles that already exist
# (new reception titles get the same from rbac/job-title-defaults.ts). Runs ON THE SERVER as root:
#   bash fix-reception-permissions.sh            # read-only: shows the roles and what would change
#   APPLY=1 bash fix-reception-permissions.sh    # backs up the role matrix, then changes it
# For every job-title role whose name is a reception title (استقبال / ريسبشن / ريسيبشن) and not a
# manager, supervisor or مسئول title:
#   - removes  خدمات سريعة (club.reception.quick_services) and إضافة لوكر (club.lockers.new);
#   - replaces تقارير المصروفات (financial-reports.reports) with إدارة المصروفات
#     (financial-reports.expenses: view, create, print). The expenses service already limits
#     reception to today's expenses of their own branch.
# Members of those roles also lose their personal ALLOW exceptions on the three removed screens
# (an exception overrides the role). Deny exceptions and expense exceptions are left as they are.
# Takes effect within ~2 minutes (permission cache).
# Undo: the restore command is printed after APPLY=1.
set -euo pipefail
DB="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
[ "$(id -u)" = 0 ] || [ "${LOCAL_TEST:-0}" = 1 ] || { echo "run as root"; exit 1; }

ROLES_SQL="
CREATE TEMPORARY TABLE reception_roles AS
  SELECT id, name_ar FROM rbac_roles
  WHERE \`key\` LIKE 'job_title\\_%'
    AND name_ar REGEXP 'استقبال|ريسبشن|ريسيبشن|ريسبشين|reception'
    AND name_ar NOT REGEXP 'مدير|مشرف|رئيس|مسئول|مسؤول|manager|supervisor';
CREATE TEMPORARY TABLE reception_users AS
  SELECT DISTINCT ur.user_id FROM rbac_user_roles ur JOIN reception_roles r ON r.id = ur.role_id;"
REMOVE_KEYS="'club.reception.quick_services','club.lockers.new','financial-reports.reports'"

run() { mysql --batch --default-character-set=utf8mb4 "$DB" -e "$ROLES_SQL $1"; }

echo "Reception roles ($DB):"
run "SELECT r.id, r.name_ar, (SELECT COUNT(*) FROM rbac_user_roles ur WHERE ur.role_id = r.id) AS users,
            (SELECT COUNT(*) FROM rbac_role_permissions p WHERE p.role_id = r.id) AS cells
     FROM reception_roles r ORDER BY r.id;"
echo "Cells to remove:"
run "SELECT r.name_ar, res.\`key\`, a.\`key\` AS action FROM rbac_role_permissions p
       JOIN reception_roles r ON r.id = p.role_id
       JOIN rbac_resources res ON res.id = p.resource_id JOIN rbac_actions a ON a.id = p.action_id
     WHERE res.\`key\` IN ($REMOVE_KEYS) ORDER BY r.id, res.\`key\`, a.\`key\`;"
echo "Personal allow exceptions to remove (reception users only):"
run "SELECT e.user_id, u.name, res.\`key\`, GROUP_CONCAT(a.\`key\` ORDER BY a.id) AS actions FROM rbac_user_exceptions e
       JOIN reception_users ru ON ru.user_id = e.user_id LEFT JOIN users u ON u.user_id = e.user_id
       JOIN rbac_resources res ON res.id = e.resource_id JOIN rbac_actions a ON a.id = e.action_id
     WHERE res.\`key\` IN ($REMOVE_KEYS) AND e.effect = 'allow'
     GROUP BY e.user_id, u.name, res.\`key\` ORDER BY e.user_id, res.\`key\`;"
echo "Other exceptions on these screens (not changed):"
run "SELECT e.user_id, u.name, res.\`key\`, e.effect, COUNT(*) AS actions,
            IF(ru.user_id IS NULL, 'not in a reception role', 'reception') AS who FROM rbac_user_exceptions e
       LEFT JOIN reception_users ru ON ru.user_id = e.user_id LEFT JOIN users u ON u.user_id = e.user_id
       JOIN rbac_resources res ON res.id = e.resource_id
     WHERE res.\`key\` IN ($REMOVE_KEYS,'financial-reports.expenses')
       AND NOT (ru.user_id IS NOT NULL AND e.effect = 'allow' AND res.\`key\` IN ($REMOVE_KEYS))
     GROUP BY e.user_id, u.name, res.\`key\`, e.effect, who ORDER BY e.user_id, res.\`key\`;"

if [ "${APPLY:-0}" != 1 ]; then
  echo "READ-ONLY CHECK. Nothing was changed. To apply: APPLY=1 bash $0"
  exit 0
fi

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/rbac-permissions-before-reception-fix-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$DB" rbac_role_permissions rbac_user_exceptions | gzip > "$BACKUP"
echo "backup: $BACKUP"

mysql --batch --skip-column-names --default-character-set=utf8mb4 "$DB" -e "$ROLES_SQL
  DELETE p FROM rbac_role_permissions p
    JOIN reception_roles r ON r.id = p.role_id
    JOIN rbac_resources res ON res.id = p.resource_id
  WHERE res.\`key\` IN ($REMOVE_KEYS);
  SELECT CONCAT('cells removed: ', ROW_COUNT());
  INSERT IGNORE INTO rbac_role_permissions (role_id, resource_id, action_id, effect)
    SELECT r.id, res.id, a.id, 'allow' FROM reception_roles r
      JOIN rbac_resources res ON res.\`key\` = 'financial-reports.expenses'
      JOIN rbac_actions a ON a.\`key\` IN ('view', 'create', 'print');
  SELECT CONCAT('expense cells added: ', ROW_COUNT());
  DELETE e FROM rbac_user_exceptions e
    JOIN reception_users ru ON ru.user_id = e.user_id
    JOIN rbac_resources res ON res.id = e.resource_id
  WHERE res.\`key\` IN ($REMOVE_KEYS) AND e.effect = 'allow';
  SELECT CONCAT('personal allow exceptions removed: ', ROW_COUNT());"
echo "RECEPTION PERMISSIONS FIX VERIFIED"
echo "undo: gunzip -c $BACKUP | mysql $DB"
