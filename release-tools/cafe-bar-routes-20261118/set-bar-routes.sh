#!/usr/bin/env bash
# صرف للبار: each branch's supply store and clearer bar/store names. Run ON THE SERVER as root:
#   bash set-bar-routes.sh            # dry run: shows what would change, and every other warehouse with its stock
#   APPLY=1 bash set-bar-routes.sh    # backs up sales_pos_settings and inv_warehouses, then writes in one transaction
#
# 1. POS settings, category 'stock', key 'store_warehouse_id' per branch (needs the 18-Nov code): the store a
#    صرف order to that branch's bar comes out of. The client has 3 stores; the Tanta store also feeds the
#    bars طنطا up and طنطا down (as in the old system, store 3 → sub-branches 8 and 9).
#    A branch that already has a store setting is left as it is.
# 2. Names: the bars (LEG-WH-*, each branch's sale warehouse) were called "مخزن ..." like the stores, so
#    every list showed two "مخزن طنطا". They become "بار ...". "مخزن برشرقي" becomes "مخزن البر الشرقي".
# Nothing is hidden or deleted: the dry run lists the other active warehouses and their stock for the client
# to decide on.
set -euo pipefail
DB="${DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
MYSQL=(mysql --default-character-set=utf8mb4 "$DB")
TANTA_STORE="${TANTA_STORE:-LEG-STORAGE-4}"
# branch → store warehouse code
STORES="2:$TANTA_STORE 3:LEG-STORAGE-3 4:LEG-STORAGE-2 5:$TANTA_STORE 6:$TANTA_STORE"
# warehouse code → new name
NAMES=(
  "LEG-WH-3|بار طنطا"
  "LEG-WH-4|بار البر الشرقي"
  "LEG-WH-5|بار الجلاء"
  "LEG-WH-8|بار طنطا up"
  "LEG-WH-9|بار طنطا down"
  "LEG-STORAGE-3|مخزن البر الشرقي"
  # 19-r1's café cleanup renamed this (Tanta's main store, 4,070 units) to «مخزن طنطا (قديم)»
  # because the local copy had it empty; on the server it is the real Tanta store.
  "LEG-STORAGE-4|مخزن طنطا"
)

sql=""
echo "== مخزن التوريد لكل فرع"
for pair in $STORES; do
  branch=${pair%%:*}; code=${pair#*:}
  row=$("${MYSQL[@]}" -N -e "SELECT id, name_ar, branch_id FROM inv_warehouses WHERE warehouse_code='$code' AND status='active' AND is_deleted=0")
  [ -n "$row" ] || { echo "!! $code is not an active warehouse — stopping"; exit 1; }
  id=$(echo "$row" | cut -f1); name=$(echo "$row" | cut -f2); wb=$(echo "$row" | cut -f3)
  bar=$("${MYSQL[@]}" -N -e "SELECT setting_value FROM sales_pos_settings WHERE branch_id=$branch AND category='stock' AND setting_key='sale_warehouse_id'" | tr -d '"')
  [ -n "$bar" ] || echo "   (branch $branch has no sale warehouse/bar set: the صرف form will not list it)"
  [ "$bar" != "$id" ] || { echo "!! branch $branch: $code is its bar — stopping"; exit 1; }
  have=$("${MYSQL[@]}" -N -e "SELECT setting_value FROM sales_pos_settings WHERE branch_id=$branch AND category='stock' AND setting_key='store_warehouse_id'")
  if [ -n "$have" ]; then echo "branch $branch: already set to $have — unchanged"; continue; fi
  echo "branch $branch: store = $id $code ($name, branch $wb)"
  sql+="INSERT INTO sales_pos_settings (branch_id, category, setting_key, setting_value, setting_type, description, sort_order, created_at, updated_at) VALUES ($branch, 'stock', 'store_warehouse_id', '$id', 'number', 'مخزن التوريد (اللي بيصرف للبار)', 1, NOW(3), NOW(3));"
done

echo "== الأسماء"
for entry in "${NAMES[@]}"; do
  code=${entry%%|*}; name=${entry#*|}
  old=$("${MYSQL[@]}" -N -e "SELECT name_ar FROM inv_warehouses WHERE warehouse_code='$code' AND is_deleted=0")
  [ -n "$old" ] || { echo "$code: not found — skipped"; continue; }
  if [ "$old" = "$name" ]; then echo "$code: already \"$name\""; continue; fi
  echo "$code: \"$old\" → \"$name\""
  sql+="UPDATE inv_warehouses SET name_ar='$name', updated_at=NOW(3) WHERE warehouse_code='$code' AND is_deleted=0;"
done

echo "== باقي المخازن النشطة (مفيش تغيير؛ للعرض على العميل)"
"${MYSQL[@]}" -e "
  SELECT w.id, w.warehouse_code, w.name_ar, w.branch_id,
         ROUND(IFNULL(SUM(b.current_stock), 0), 2) AS stock, COUNT(NULLIF(b.current_stock, 0)) AS items
  FROM inv_warehouses w LEFT JOIN inv_stock_balances b ON b.warehouse_id = w.id
  WHERE w.status='active' AND w.is_deleted=0
    AND w.warehouse_code NOT IN ('LEG-WH-3','LEG-WH-4','LEG-WH-5','LEG-WH-8','LEG-WH-9','LEG-STORAGE-2','LEG-STORAGE-3','$TANTA_STORE')
  GROUP BY w.id ORDER BY w.branch_id, w.id"

[ -n "$sql" ] || { echo "nothing to write"; exit 0; }
if [ "${APPLY:-}" != 1 ]; then echo "dry run — run again with APPLY=1 to write"; exit 0; fi
mkdir -p "$APP/tmp"
backup="$APP/tmp/before-bar-routes-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$DB" sales_pos_settings inv_warehouses | gzip > "$backup"
echo "backup: $backup"
"${MYSQL[@]}" -e "START TRANSACTION; $sql COMMIT;"
"${MYSQL[@]}" -e "
  SELECT s.branch_id, s.setting_key, w.warehouse_code, w.name_ar
  FROM sales_pos_settings s JOIN inv_warehouses w ON w.id = s.setting_value
  WHERE s.category='stock' AND s.setting_key IN ('sale_warehouse_id','store_warehouse_id') ORDER BY s.branch_id, s.setting_key"
echo "rollback: gunzip < $backup | mysql $DB"
echo "  (or only the store setting: DELETE FROM sales_pos_settings WHERE category='stock' AND setting_key='store_warehouse_id';)"
