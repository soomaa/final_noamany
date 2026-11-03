#!/usr/bin/env bash
# Branch store stock from the old gym system into the new store warehouses, run ON THE SERVER as root:
#   bash sync-store-stock-from-old.sh            # dry run: per-store totals and differences, changes nothing
#   APPLY=1 bash sync-store-stock-from-old.sh    # backup, then apply in one transaction
#
# The old store screens (store report Reports_m::Get_all_items, صرف order Sarf_m::select_all_items_by_branch,
# helpers/rased_item_helper.php) show, per store (store_branch_settings sub-branch 3 طنطا, 4 البرالشرقي,
# 5 الجلاء) and item:
#   opening (store_rasid_ayni) + purchases (store_purchases_others, amount_buy > 0)
#   + transfers in (store_tahwelat_asnaf.to_storage) - صرف orders to the bars (store_start_other_items;
#   the Tanta store, 3, also feeds the bars طنطا up 8 and طنطا down 9) - purchase returns
#   (store_return_purchases_item) - transfers out (store_tahwelat_asnaf.from_storage).
# A negative figure is taken as 0. Each store's balance in its new warehouse is set to that figure for
# every item imported from the old system (cafe_products LEG-CAFE-<old id>), with one adjustment movement
# per change (doc_type legacy_stock_sync) and the per-branch totals recomputed:
#   old store 4 البرالشرقي -> LEG-STORAGE-3 "مخزن برشرقي" (branch 3)
#   old store 5 الجلاء     -> LEG-STORAGE-2 "مخزن الجلاء" (branch 4)
#   old store 3 طنطا       -> $TANTA_STORE (branch 2)
# The bar warehouses (sync-bar-stock-from-old.sh), items made in the new system and the other store
# warehouses are not touched. Safe to run again (for example on the night the café moves over).
# It also gives the 3 Nov bar sync's stock-out movements the negative quantity the app writes
# (InventoryStockService.applyMovement); the stock dashboard sums them as signed.
set -euo pipefail
O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
TANTA_STORE="${TANTA_STORE:-LEG-STORAGE-4}"

read -r -d '' PREP <<SQL || true
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP TEMPORARY TABLE IF EXISTS store_map;
CREATE TEMPORARY TABLE store_map (br INT, warehouse_code VARCHAR(50)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO store_map VALUES (3, '$TANTA_STORE'), (4, 'LEG-STORAGE-3'), (5, 'LEG-STORAGE-2');
DROP TEMPORARY TABLE IF EXISTS store_old;
CREATE TEMPORARY TABLE store_old AS
  SELECT b.br, i.id AS old_id,
    GREATEST(0,
      (SELECT IFNULL(SUM(r.sanf_amount), 0) FROM \`$O\`.store_rasid_ayni r
        WHERE r.sanf_code = i.sanf_code AND r.sub_branch_id_fk = b.br)
    + (SELECT IFNULL(SUM(p.amount_buy), 0) FROM \`$O\`.store_purchases_others p
        WHERE p.product_code = i.sanf_code AND p.sub_branch_id_fk = b.br AND p.amount_buy > 0)
    + (SELECT IFNULL(SUM(t.amount_send), 0) FROM \`$O\`.store_tahwelat_asnaf t
        WHERE t.sanf_code = i.sanf_code AND t.to_storage = b.br)
    - (SELECT IFNULL(SUM(s.amount), 0) FROM \`$O\`.store_start_other_items s
        WHERE s.sanf_code = i.sanf_code AND (s.sub_branch = b.br OR (b.br = 3 AND s.sub_branch IN (8, 9))))
    - (SELECT IFNULL(SUM(x.return_amount), 0) FROM \`$O\`.store_return_purchases_item x
        WHERE x.item_code = i.sanf_code AND x.sub_branch_id_fk = b.br)
    - (SELECT IFNULL(SUM(t.amount_send), 0) FROM \`$O\`.store_tahwelat_asnaf t
        WHERE t.sanf_code = i.sanf_code AND t.from_storage = b.br)) AS qty
  FROM \`$O\`.store_item i
  JOIN (SELECT 3 AS br UNION SELECT 4 UNION SELECT 5) b
  WHERE i.id_from <> 0;
DROP TEMPORARY TABLE IF EXISTS store_sync;
CREATE TEMPORARY TABLE store_sync AS
  SELECT o.br, o.old_id, w.id AS warehouse_id, w.branch_id, n.inventory_product_id AS product_id,
         o.qty AS target, IFNULL(sb.current_stock, 0) AS current, ip.cost_price
  FROM store_old o
  JOIN store_map m ON m.br = o.br
  JOIN \`$N\`.inv_warehouses w ON w.warehouse_code = m.warehouse_code
  JOIN \`$N\`.cafe_products n ON n.product_code = CONCAT('LEG-CAFE-', o.old_id) AND n.inventory_product_id IS NOT NULL
  JOIN \`$N\`.inv_products ip ON ip.id = n.inventory_product_id
  LEFT JOIN \`$N\`.inv_stock_balances sb ON sb.product_id = n.inventory_product_id AND sb.warehouse_id = w.id
  WHERE o.qty > 0 OR sb.id IS NOT NULL;
SQL

read -r -d '' REPORT <<SQL || true
SELECT s.br, w.warehouse_code, w.name_ar, IF(w.is_deleted, 'deleted', 'active'), SUM(s.target > 0) AS items_in_stock,
       SUM(s.target) AS old_qty, SUM(s.current) AS new_qty, SUM(ABS(s.target - s.current) > 0.0005) AS to_change
FROM store_sync s JOIN \`$N\`.inv_warehouses w ON w.id = s.warehouse_id
GROUP BY s.br, w.warehouse_code, w.name_ar, w.is_deleted ORDER BY s.br;
SQL

echo "=== per store: old system stock vs new system now (old store, warehouse, name, state, items in stock, old qty, new qty, items to change)"
mysql --batch "$N" -e "$PREP $REPORT"
echo "=== old items in stock with no imported café item (should be 0)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT COUNT(*) FROM store_old o WHERE o.qty > 0
  AND NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.product_code = CONCAT('LEG-CAFE-', o.old_id) AND n.inventory_product_id IS NOT NULL);"
echo "=== bar sync stock-out movements with a positive quantity (to make negative)"
mysql --batch --skip-column-names "$N" -e "SELECT COUNT(*) FROM \`$N\`.inv_movements WHERE doc_type = 'legacy_stock_sync' AND direction = 'out' AND quantity > 0;"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/cafe-store-stock-before-old-sync-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" inv_warehouses inv_stock_balances inv_movements inv_product_branches | gzip > "$BACKUP"
echo "backup: $BACKUP"

mysql "$N" <<SQL
$PREP
START TRANSACTION;
UPDATE \`$N\`.inv_movements SET quantity = -quantity
  WHERE doc_type = 'legacy_stock_sync' AND direction = 'out' AND quantity > 0;
-- A mapped store warehouse that was deleted in the new system is brought back.
UPDATE \`$N\`.inv_warehouses w JOIN store_map m ON m.warehouse_code = w.warehouse_code
  SET w.is_deleted = 0, w.status = 'active', w.updated_at = NOW(3) WHERE w.is_deleted = 1;
INSERT INTO \`$N\`.inv_movements (movement_date, txn_type, direction, product_id, warehouse_id, quantity, unit_cost,
    balance_after, doc_type, doc_ref, branch_id, notes, created_at)
  SELECT NOW(3), 'adjustment', IF(s.target > s.current, 'in', 'out'), s.product_id, s.warehouse_id,
         s.target - s.current, s.cost_price, s.target, 'legacy_stock_sync', DATE_FORMAT(NOW(), '%Y%m%d'),
         s.branch_id, 'رصيد المخزن من السيستم القديم', NOW(3)
  FROM store_sync s WHERE ABS(s.target - s.current) > 0.0005;
INSERT INTO \`$N\`.inv_stock_balances (product_id, warehouse_id, current_stock, last_updated, created_at)
  SELECT s.product_id, s.warehouse_id, s.target, NOW(3), NOW(3) FROM store_sync s WHERE ABS(s.target - s.current) > 0.0005
  ON DUPLICATE KEY UPDATE current_stock = VALUES(current_stock), last_updated = NOW(3);
-- Per-branch totals for the items touched: the sum of all the branch's warehouses.
INSERT INTO \`$N\`.inv_product_branches (product_id, branch_id, stock_quantity, last_updated, created_at)
  SELECT t.product_id, t.branch_id, IFNULL(SUM(b.current_stock), 0), NOW(3), NOW(3)
  FROM (SELECT DISTINCT product_id, branch_id FROM store_sync) t
  JOIN \`$N\`.inv_warehouses w ON w.branch_id = t.branch_id AND w.is_deleted = 0
  LEFT JOIN \`$N\`.inv_stock_balances b ON b.product_id = t.product_id AND b.warehouse_id = w.id
  GROUP BY t.product_id, t.branch_id
  ON DUPLICATE KEY UPDATE stock_quantity = VALUES(stock_quantity), last_updated = NOW(3);
COMMIT;
SQL
echo "=== after (to_change should be 0)"
mysql --batch "$N" -e "$PREP $REPORT"
echo "STORE STOCK FROM OLD SYSTEM APPLIED"
echo "undo: gunzip -c $BACKUP | mysql $N"
