#!/usr/bin/env bash
# Bar stock from the old gym system into the new café warehouses, run ON THE SERVER as root:
#   bash sync-bar-stock-from-old.sh            # dry run: per-bar totals and differences, changes nothing
#   APPLY=1 bash sync-bar-stock-from-old.sh    # backup, then apply in one transaction
#
# The old bar screen shows, per bar (store_branch_settings sub-branch 3 طنطا, 4 البرالشرقي, 5 الجلاء,
# 8 طنطا up, 9 طنطا down) and item, the stock its sale screen sells from (bar_m/Sales_m::get_allMainProducts):
#   issued to the bar (store_purchases, old=0) + bar opening balance (store_rasid_ayni_bar)
#   + sales returns (bar_hadback_sales) - sales and drawings (bar_sales, old=0).
# Its daily جرد only records the count; staff correct the stock through drawings, so this figure is
# the one the counts agree with. A negative figure is taken as 0.
# Each bar's balance in its new warehouse (LEG-WH-<sub-branch>, made by the 2 Aug import) is set to that
# figure for every item imported from the old system (cafe_products LEG-CAFE-<old id>), with one
# adjustment movement per change (doc_type legacy_stock_sync), and the per-branch totals recomputed.
# Items made in the new system and the store warehouses are not touched. Safe to run again: a second run
# brings the bars back to the old system's figures (for example on the night the café moves over).
set -euo pipefail
O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
BARS="3,4,5,8,9"

read -r -d '' PREP <<SQL || true
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP TEMPORARY TABLE IF EXISTS bar_old;
CREATE TEMPORARY TABLE bar_old AS
  SELECT b.br, i.id AS old_id,
    GREATEST(0,
      (SELECT IFNULL(SUM(p.amount_buy), 0) FROM \`$O\`.store_purchases p
        WHERE p.product_code = i.sanf_code AND p.sub_branch_id_fk = b.br AND p.old = 0)
    + (SELECT IFNULL(SUM(r.sanf_amount), 0) FROM \`$O\`.store_rasid_ayni_bar r
        WHERE r.sanf_code = i.sanf_code AND r.sub_branch_id_fk = b.br)
    + (SELECT IFNULL(SUM(h.item_amount), 0) FROM \`$O\`.bar_hadback_sales h
        WHERE h.item_id = i.id AND h.sub_branch_id_fk = b.br)
    - (SELECT IFNULL(SUM(s.item_amount), 0) FROM \`$O\`.bar_sales s
        WHERE s.item_id = i.id AND s.sub_branch_id_fk = b.br AND s.old = 0)) AS qty
  FROM \`$O\`.store_item i
  JOIN (SELECT 3 AS br UNION SELECT 4 UNION SELECT 5 UNION SELECT 8 UNION SELECT 9) b
  WHERE i.id_from IN (1,2,3,4,5);
DROP TEMPORARY TABLE IF EXISTS bar_sync;
CREATE TEMPORARY TABLE bar_sync AS
  SELECT o.br, o.old_id, w.id AS warehouse_id, w.branch_id, n.inventory_product_id AS product_id,
         o.qty AS target, IFNULL(sb.current_stock, 0) AS current, ip.cost_price
  FROM bar_old o
  JOIN \`$N\`.inv_warehouses w ON w.warehouse_code = CONCAT('LEG-WH-', o.br) AND w.is_deleted = 0
  JOIN \`$N\`.cafe_products n ON n.product_code = CONCAT('LEG-CAFE-', o.old_id) AND n.inventory_product_id IS NOT NULL
  JOIN \`$N\`.inv_products ip ON ip.id = n.inventory_product_id
  LEFT JOIN \`$N\`.inv_stock_balances sb ON sb.product_id = n.inventory_product_id AND sb.warehouse_id = w.id
  WHERE o.qty > 0 OR sb.id IS NOT NULL;
SQL

read -r -d '' REPORT <<SQL || true
SELECT s.br, w.name_ar, SUM(s.target > 0) AS items_in_stock, SUM(s.target) AS old_qty, SUM(s.current) AS new_qty,
       SUM(ABS(s.target - s.current) > 0.0005) AS to_change
FROM bar_sync s JOIN \`$N\`.inv_warehouses w ON w.id = s.warehouse_id GROUP BY s.br, w.name_ar ORDER BY s.br;
SQL

echo "=== per bar: old system stock vs new system now (sub-branch, warehouse, items in stock, old qty, new qty, items to change)"
mysql --batch "$N" -e "$PREP $REPORT"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/cafe-stock-before-old-sync-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" inv_stock_balances inv_movements inv_product_branches | gzip > "$BACKUP"
echo "backup: $BACKUP"

mysql "$N" <<SQL
$PREP
START TRANSACTION;
INSERT INTO \`$N\`.inv_movements (movement_date, txn_type, direction, product_id, warehouse_id, quantity, unit_cost,
    balance_after, doc_type, doc_ref, branch_id, notes, created_at)
  SELECT NOW(3), 'adjustment', IF(s.target > s.current, 'in', 'out'), s.product_id, s.warehouse_id,
         ABS(s.target - s.current), s.cost_price, s.target, 'legacy_stock_sync', DATE_FORMAT(NOW(), '%Y%m%d'),
         s.branch_id, 'رصيد البار من السيستم القديم', NOW(3)
  FROM bar_sync s WHERE ABS(s.target - s.current) > 0.0005;
INSERT INTO \`$N\`.inv_stock_balances (product_id, warehouse_id, current_stock, last_updated, created_at)
  SELECT s.product_id, s.warehouse_id, s.target, NOW(3), NOW(3) FROM bar_sync s WHERE ABS(s.target - s.current) > 0.0005
  ON DUPLICATE KEY UPDATE current_stock = VALUES(current_stock), last_updated = NOW(3);
-- Per-branch totals for the items touched: the sum of all the branch's warehouses.
INSERT INTO \`$N\`.inv_product_branches (product_id, branch_id, stock_quantity, last_updated, created_at)
  SELECT t.product_id, t.branch_id, IFNULL(SUM(b.current_stock), 0), NOW(3), NOW(3)
  FROM (SELECT DISTINCT product_id, branch_id FROM bar_sync) t
  JOIN \`$N\`.inv_warehouses w ON w.branch_id = t.branch_id AND w.is_deleted = 0
  LEFT JOIN \`$N\`.inv_stock_balances b ON b.product_id = t.product_id AND b.warehouse_id = w.id
  GROUP BY t.product_id, t.branch_id
  ON DUPLICATE KEY UPDATE stock_quantity = VALUES(stock_quantity), last_updated = NOW(3);
COMMIT;
SQL
echo "=== after (to_change should be 0)"
mysql --batch "$N" -e "$PREP $REPORT"
echo "BAR STOCK FROM OLD SYSTEM APPLIED"
echo "undo: gunzip -c $BACKUP | mysql $N"
