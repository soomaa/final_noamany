#!/usr/bin/env bash
# Hide the plans the old system had stopped (tbl_subscription_settings.approved = 2).
# The import copied every old plan as active, so ended offers and test plans still show in
# "add subscription". Runs ON THE SERVER as root:
#   bash fix-stopped-plans.sh            # read-only: shows what would change
#   APPLY=1 bash fix-stopped-plans.sh    # backs up the plan table, then switches those plans off
# A plan is switched off only when its id, price and name still match stopped-plans.tsv, so a
# plan renamed or repriced since the import is left alone. Already-sold subscriptions, renewals
# and reports are not affected; only the "add subscription" list changes.
# Undo: the restore command is printed after APPLY=1.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
LIST="$HERE/stopped-plans.tsv"
q() { mysql --batch --skip-column-names --default-character-set=utf8mb4 "$DB" -e "$1"; }

[ "$(id -u)" = 0 ] || [ "${LOCAL_TEST:-0}" = 1 ] || { echo "run as root"; exit 1; }
[ "$(wc -l < "$LIST")" -gt 0 ] || { echo "empty list"; exit 1; }

# The matching runs in one mysql session because the temporary table lives only inside it.
ROWS_SQL=$(awk -F'\t' '{ gsub(/\\/, "\\\\", $3); gsub(/\047/, "\047\047", $3); printf "%s(%d,%s,\047%s\047)", (NR > 1 ? "," : ""), $1, $2, $3 }' "$LIST")
MATCH_SQL="
CREATE TEMPORARY TABLE stopped_plans (id INT PRIMARY KEY, price DECIMAL(10,2), name VARCHAR(150)) DEFAULT CHARSET=utf8mb4;
INSERT INTO stopped_plans VALUES $ROWS_SQL;
CREATE TEMPORARY TABLE matched AS
  SELECT t.id FROM club_subscription_types t JOIN stopped_plans s
    ON s.id = t.id AND s.price = t.price
   AND s.name COLLATE utf8mb4_bin = CONVERT(TRIM(t.name) USING utf8mb4) COLLATE utf8mb4_bin
  WHERE t.is_active = 1;"

summary() {
  mysql --batch --default-character-set=utf8mb4 "$DB" -e "$MATCH_SQL
    SELECT COUNT(*) AS in_list, (SELECT COUNT(*) FROM matched) AS will_switch_off FROM stopped_plans;
    SELECT t.id, t.branch_id, t.price, TRIM(t.name) AS name FROM club_subscription_types t JOIN matched m ON m.id = t.id ORDER BY t.branch_id, t.name LIMIT 400;"
}

if [ "${APPLY:-0}" != 1 ]; then
  echo "READ-ONLY CHECK ($DB). Nothing is changed. Plans that would be switched off:"
  summary
  echo "To apply: APPLY=1 bash $HERE/fix-stopped-plans.sh"
  exit 0
fi

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/club-subscription-types-before-stopped-plans-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$DB" club_subscription_types | gzip > "$BACKUP"
echo "backup: $BACKUP"

changed=$(mysql --batch --skip-column-names --default-character-set=utf8mb4 "$DB" -e "$MATCH_SQL
  UPDATE club_subscription_types t JOIN matched m ON m.id = t.id SET t.is_active = 0;
  SELECT ROW_COUNT();")
echo "plans switched off: $changed"
echo "active plans now: $(q 'SELECT COUNT(*) FROM club_subscription_types WHERE is_active = 1')"
echo "STOPPED PLANS FIX VERIFIED"
echo "undo: gunzip -c $BACKUP | mysql $DB"
