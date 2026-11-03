#!/usr/bin/env bash
# Sets each branch's café sale warehouse (its bar) in POS settings: category 'stock', key
# 'sale_warehouse_id'. Sales, drawings, purchases and counts without a picked warehouse use it.
#   bash set-sale-warehouses.sh            # dry run: shows what would be written
#   APPLY=1 bash set-sale-warehouses.sh    # backs up sales_pos_settings, then writes
# A branch that already has a sale warehouse is left as it is.
set -euo pipefail
DB="${DB:-noamanycenter_nest}"
MYSQL=(mysql --default-character-set=utf8mb4 "$DB")
# branch → bar warehouse code (the bars the old system's bar stock was copied into).
PAIRS="2:LEG-WH-3 3:LEG-WH-4 4:LEG-WH-5 5:LEG-WH-8 6:LEG-WH-9"

sql=""
for pair in $PAIRS; do
  branch=${pair%%:*}; code=${pair#*:}
  row=$("${MYSQL[@]}" -N -e "SELECT id, name_ar FROM inv_warehouses WHERE warehouse_code='$code' AND branch_id=$branch AND status='active' AND is_deleted=0")
  [ -n "$row" ] || { echo "!! $code is not an active warehouse of branch $branch — stopping"; exit 1; }
  id=$(echo "$row" | cut -f1); name=$(echo "$row" | cut -f2)
  have=$("${MYSQL[@]}" -N -e "SELECT setting_value FROM sales_pos_settings WHERE branch_id=$branch AND category='stock' AND setting_key='sale_warehouse_id'")
  if [ -n "$have" ]; then echo "branch $branch: already set to $have — unchanged"; continue; fi
  echo "branch $branch: sale warehouse = $id $code ($name)"
  sql+="INSERT INTO sales_pos_settings (branch_id, category, setting_key, setting_value, setting_type, description, sort_order, created_at, updated_at) VALUES ($branch, 'stock', 'sale_warehouse_id', '$id', 'number', 'مخزن البيع الافتراضي (البار)', 0, NOW(3), NOW(3));"
done

[ -n "$sql" ] || { echo "nothing to write"; exit 0; }
if [ "${APPLY:-}" != 1 ]; then echo "dry run — run again with APPLY=1 to write"; exit 0; fi
mkdir -p /home/noamanycenter/final.noamanycenter.com/tmp
backup=/home/noamanycenter/final.noamanycenter.com/tmp/pos-settings-before-sale-warehouse-$(date +%Y%m%d-%H%M%S).sql.gz
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$DB" sales_pos_settings | gzip > "$backup"
echo "backup: $backup"
"${MYSQL[@]}" -e "START TRANSACTION; $sql COMMIT;"
"${MYSQL[@]}" -e "SELECT s.branch_id, s.setting_value, w.warehouse_code, w.name_ar FROM sales_pos_settings s JOIN inv_warehouses w ON w.id = s.setting_value WHERE s.category='stock' AND s.setting_key='sale_warehouse_id' ORDER BY s.branch_id"
echo "rollback: DELETE FROM sales_pos_settings WHERE category='stock' AND setting_key='sale_warehouse_id';"
