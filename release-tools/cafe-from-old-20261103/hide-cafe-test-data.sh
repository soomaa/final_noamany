#!/usr/bin/env bash
# Hides the café test data on production, run ON THE SERVER as root:
#   bash hide-cafe-test-data.sh            # dry run: lists everything it would hide, changes nothing
#   APPLY=1 bash hide-cafe-test-data.sh    # backup, then apply in one transaction
#
# Test data = the café items made in the new system while it was being tried (cafe_products not
# imported from the old one: gfgf, curs, شيبسى, لاتيه, kk, uu, n, اا, test, عع, مياه معدنيه,
# "اختبار كافيه لاتيه كيلو", and their inv_products), the E2E category, warehouse and supplier (id 1),
# and every document made with them: café sales, supplier invoices and payments, purchase orders,
# goods receipts, stock issues and transfers, opening balances.
# Nothing is hard-deleted:
# - documents get is_deleted = 1 (sales: status cancelled, with an event saying why);
# - their posted journal entries are reversed the way the app does it (a JE-M-… entry with the lines
#   swapped, the original marked reversed), so every account nets to zero;
# - the test items' stock is set to 0 with one adjustment movement each (doc_type test_data_cleanup),
#   and the per-branch totals recomputed;
# - the items, category, warehouse and supplier are hidden (is_active = 0 / is_deleted = 1).
# HIDE_WH2016=1 also hides warehouse WH000001 "بار البر الشرقى" (made on 20 Oct, only test items in it).
# Safe to run again: a second run finds nothing left to change.
set -euo pipefail
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
REASON='بيانات تجربة الكافيه — إخفاء'
TEST_CAFE="1,2,3,4,5,6,7,8,9,2478,2479,2480"     # cafe_products ids (none is LEG-CAFE-…)
TEST_INV="1,2,3,4,5,6,7,2476,2477,2478"          # inv_products ids (none is L<old id>-…)
TEST_WH="1"; [ "${HIDE_WH2016:-0}" = 1 ] && TEST_WH="1,2016"

read -r -d '' PREP <<SQL || true
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP TEMPORARY TABLE IF EXISTS t_cafe, t_inv, t_qs, t_sinv, t_pay, t_po, t_grn, t_txn, t_open, t_docs, t_je, t_bal;
CREATE TEMPORARY TABLE t_cafe AS SELECT id FROM \`$N\`.cafe_products WHERE id IN ($TEST_CAFE) AND product_code NOT LIKE 'LEG-CAFE-%';
CREATE TEMPORARY TABLE t_inv AS SELECT id FROM \`$N\`.inv_products WHERE id IN ($TEST_INV) AND product_code NOT REGEXP '^L[0-9]+-';
CREATE TEMPORARY TABLE t_qs AS SELECT q.id, q.sale_number FROM \`$N\`.sales_quick_sales q
  WHERE q.warehouse_id IN ($TEST_WH) OR q.id IN (SELECT i.quick_sale_id FROM \`$N\`.sales_quick_sale_items i
    WHERE i.cafe_product_id IN (SELECT id FROM t_cafe) OR i.inventory_product_id IN (SELECT id FROM t_inv));
CREATE TEMPORARY TABLE t_sinv AS SELECT s.id, s.invoice_number FROM \`$N\`.prc_supplier_invoices s
  WHERE s.supplier_id = 1 OR s.warehouse_id IN ($TEST_WH)
     OR s.id IN (SELECT i.invoice_id FROM \`$N\`.prc_supplier_invoice_items i WHERE i.product_id IN (SELECT id FROM t_inv));
CREATE TEMPORARY TABLE t_pay AS SELECT p.id, p.payment_number FROM \`$N\`.prc_supplier_payments p
  WHERE p.supplier_id = 1 OR p.invoice_id IN (SELECT id FROM t_sinv);
CREATE TEMPORARY TABLE t_po AS SELECT o.id FROM \`$N\`.prc_purchase_orders o
  WHERE o.supplier_id = 1 OR o.warehouse_id IN ($TEST_WH)
     OR o.id IN (SELECT i.purchase_order_id FROM \`$N\`.prc_purchase_order_items i WHERE i.product_id IN (SELECT id FROM t_inv));
CREATE TEMPORARY TABLE t_grn AS SELECT g.id, g.grn_number FROM \`$N\`.prc_goods_receipts g
  WHERE g.warehouse_id IN ($TEST_WH) OR g.purchase_order_id IN (SELECT id FROM t_po)
     OR g.id IN (SELECT i.goods_receipt_id FROM \`$N\`.prc_goods_receipt_items i WHERE i.product_id IN (SELECT id FROM t_inv));
CREATE TEMPORARY TABLE t_txn AS SELECT t.id FROM \`$N\`.inv_transactions t
  WHERE t.source_warehouse_id IN ($TEST_WH) OR t.target_warehouse_id IN ($TEST_WH)
     OR t.id IN (SELECT i.transaction_id FROM \`$N\`.inv_transaction_items i WHERE i.product_id IN (SELECT id FROM t_inv));
CREATE TEMPORARY TABLE t_open AS SELECT o.id FROM \`$N\`.inv_opening_stocks o
  WHERE o.warehouse_id IN ($TEST_WH) OR o.product_id IN (SELECT id FROM t_inv);
-- The journal source of each test document (source_doc_type, source_doc_id), as the app posts them.
CREATE TEMPORARY TABLE t_docs (doc_type VARCHAR(60), doc_id VARCHAR(80)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO t_docs SELECT 'quick_sale', sale_number FROM t_qs;
INSERT INTO t_docs SELECT 'purchase_invoice', invoice_number FROM t_sinv;
INSERT INTO t_docs SELECT 'supplier_payment', payment_number FROM t_pay;
INSERT INTO t_docs SELECT 'goods_receipt', grn_number FROM t_grn;
INSERT INTO t_docs SELECT 'internal_issue', id FROM t_txn;
INSERT INTO t_docs SELECT 'opening_stock', id FROM t_open;
CREATE TEMPORARY TABLE t_je AS SELECT e.id FROM \`$N\`.acc_journal_entries e
  JOIN t_docs d ON d.doc_type = e.source_doc_type AND d.doc_id = e.source_doc_id
  WHERE e.status = 'posted' AND e.reversed_by_id IS NULL AND e.source_module IN ('sales', 'procurement', 'inventory');
CREATE TEMPORARY TABLE t_bal AS SELECT b.product_id, b.warehouse_id, w.branch_id, b.current_stock, p.cost_price
  FROM \`$N\`.inv_stock_balances b JOIN \`$N\`.inv_warehouses w ON w.id = b.warehouse_id
  JOIN \`$N\`.inv_products p ON p.id = b.product_id
  WHERE b.product_id IN (SELECT id FROM t_inv) AND ABS(b.current_stock) > 0.0005;
SQL

read -r -d '' REPORT <<SQL || true
SELECT 'café items to hide', COUNT(*) FROM \`$N\`.cafe_products WHERE id IN (SELECT id FROM t_cafe) AND is_active = 1;
SELECT 'inventory items to hide', COUNT(*) FROM \`$N\`.inv_products WHERE id IN (SELECT id FROM t_inv) AND is_deleted = 0;
SELECT 'café sales to cancel', COUNT(*) FROM \`$N\`.sales_quick_sales WHERE id IN (SELECT id FROM t_qs) AND status IN ('completed', 'draft');
SELECT 'supplier invoices to hide', COUNT(*) FROM \`$N\`.prc_supplier_invoices WHERE id IN (SELECT id FROM t_sinv) AND is_deleted = 0;
SELECT 'supplier payments to hide', COUNT(*) FROM \`$N\`.prc_supplier_payments WHERE id IN (SELECT id FROM t_pay) AND is_deleted = 0;
SELECT 'purchase orders to hide', COUNT(*) FROM \`$N\`.prc_purchase_orders WHERE id IN (SELECT id FROM t_po) AND is_deleted = 0;
SELECT 'goods receipts to hide', COUNT(*) FROM \`$N\`.prc_goods_receipts WHERE id IN (SELECT id FROM t_grn) AND is_deleted = 0;
SELECT 'stock issues/transfers to hide', COUNT(*) FROM \`$N\`.inv_transactions WHERE id IN (SELECT id FROM t_txn) AND is_deleted = 0;
SELECT 'opening balances to hide', COUNT(*) FROM \`$N\`.inv_opening_stocks WHERE id IN (SELECT id FROM t_open) AND is_deleted = 0;
SELECT 'journal entries to reverse', COUNT(*) FROM t_je;
SELECT 'stock rows to set to 0', COUNT(*) FROM t_bal;
SELECT 'category / warehouses / supplier to hide',
  (SELECT COUNT(*) FROM \`$N\`.inv_categories WHERE id = 1 AND is_deleted = 0),
  (SELECT COUNT(*) FROM \`$N\`.inv_warehouses WHERE id IN ($TEST_WH) AND is_deleted = 0),
  (SELECT COUNT(*) FROM \`$N\`.inv_suppliers WHERE id = 1 AND is_deleted = 0);
SQL

echo "=== summary"
mysql --batch --skip-column-names "$N" -e "$PREP $REPORT"
echo "=== café items (id, code, name, active)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT id, product_code, name, is_active FROM \`$N\`.cafe_products WHERE id IN (SELECT id FROM t_cafe) ORDER BY id;"
echo "=== café sales (number, branch, warehouse, status, total, by user)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT q.sale_number, q.branch_id, q.warehouse_id, q.status, q.total_amount, q.created_by FROM \`$N\`.sales_quick_sales q WHERE q.id IN (SELECT id FROM t_qs) ORDER BY q.id;"
echo "=== supplier invoices and payments (number, supplier, total/amount, by user)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT s.invoice_number, s.supplier_id, s.total_amount, s.created_by FROM \`$N\`.prc_supplier_invoices s WHERE s.id IN (SELECT id FROM t_sinv) ORDER BY s.id;"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT p.payment_number, p.supplier_id, p.payment_amount, p.created_by FROM \`$N\`.prc_supplier_payments p WHERE p.id IN (SELECT id FROM t_pay) ORDER BY p.id;"
echo "=== journal entries to reverse (entry, date, branch, type, document, amount)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT e.entry_no, e.date, e.branch_id, e.source_doc_type, e.source_doc_id, e.total_debit FROM \`$N\`.acc_journal_entries e WHERE e.id IN (SELECT id FROM t_je) ORDER BY e.id;"
echo "=== stock set to 0 (warehouse, item, qty now)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT w.warehouse_code, b.product_id, b.current_stock FROM t_bal b JOIN \`$N\`.inv_warehouses w ON w.id = b.warehouse_id ORDER BY b.warehouse_id, b.product_id;"
echo "=== documents by anyone other than admin (128) or the July test user (1): should be none"
mysql --batch --skip-column-names "$N" -e "$PREP
  SELECT 'sale', q.sale_number, q.created_by FROM \`$N\`.sales_quick_sales q WHERE q.id IN (SELECT id FROM t_qs) AND IFNULL(q.created_by, 1) NOT IN (1, 128)
  UNION ALL SELECT 'supplier invoice', s.invoice_number, s.created_by FROM \`$N\`.prc_supplier_invoices s WHERE s.id IN (SELECT id FROM t_sinv) AND IFNULL(s.created_by, 1) NOT IN (1, 128)
  UNION ALL SELECT 'stock document', t.reference, t.created_by FROM \`$N\`.inv_transactions t WHERE t.id IN (SELECT id FROM t_txn) AND IFNULL(t.created_by, 1) NOT IN (1, 128)
  UNION ALL SELECT 'purchase order', o.po_number, o.created_by FROM \`$N\`.prc_purchase_orders o WHERE o.id IN (SELECT id FROM t_po) AND IFNULL(o.created_by, 1) NOT IN (1, 128);"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/cafe-before-test-data-hide-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" cafe_products inv_products inv_categories \
  inv_warehouses inv_suppliers inv_supplier_products inv_stock_balances inv_movements inv_product_branches inv_opening_stocks \
  inv_transactions prc_supplier_invoices prc_supplier_payments prc_purchase_orders prc_goods_receipts sales_quick_sales \
  sales_invoice_events acc_journal_entries acc_journal_entry_lines | gzip > "$BACKUP"
echo "backup: $BACKUP"

mysql "$N" <<SQL
$PREP
START TRANSACTION;
-- 1) Reverse the posted journal entries (as LedgerService.reverseEntry: JE-M-<date>-<n>, lines swapped).
DROP TEMPORARY TABLE IF EXISTS t_rev;
CREATE TEMPORARY TABLE t_rev AS
  SELECT e.id AS orig_id, REPLACE(e.date, '-', '') AS bucket, ROW_NUMBER() OVER (PARTITION BY e.date ORDER BY e.id) AS n
  FROM \`$N\`.acc_journal_entries e WHERE e.id IN (SELECT id FROM t_je);
INSERT INTO \`$N\`.acc_journal_entries (entry_no, date, branch_id, description, reference, status, source_module,
    source_doc_type, source_doc_id, total_debit, total_credit, reverses_id, reversal_reason, posted_at, created_at, updated_at)
  SELECT CONCAT('JE-M-', r.bucket, '-', LPAD(r.n + (SELECT COUNT(*) FROM \`$N\`.acc_journal_entries x
           WHERE x.entry_no LIKE CONCAT('JE-M-', r.bucket, '-%')), 4, '0')),
         e.date, e.branch_id, CONCAT('عكس: ', IFNULL(e.description, e.entry_no)), e.entry_no, 'posted', e.source_module,
         CONCAT(e.source_doc_type, '_reversal'), CONCAT(e.source_doc_id, '-rev-', e.id), e.total_credit, e.total_debit,
         e.id, '$REASON', NOW(3), NOW(3), NOW(3)
  FROM t_rev r JOIN \`$N\`.acc_journal_entries e ON e.id = r.orig_id ORDER BY e.id;
INSERT INTO \`$N\`.acc_journal_entry_lines (entry_id, account_id, debit, credit, description, line_order, created_at)
  SELECT v.id, l.account_id, l.credit, l.debit, l.description, l.line_order, NOW(3)
  FROM \`$N\`.acc_journal_entry_lines l JOIN \`$N\`.acc_journal_entries v ON v.reverses_id = l.entry_id
  WHERE l.entry_id IN (SELECT orig_id FROM t_rev);
UPDATE \`$N\`.acc_journal_entries o JOIN \`$N\`.acc_journal_entries v ON v.reverses_id = o.id
  SET o.status = 'reversed', o.reversed_by_id = v.id, o.updated_at = NOW(3)
  WHERE o.id IN (SELECT orig_id FROM t_rev);
-- 2) Documents.
INSERT INTO \`$N\`.sales_invoice_events (quick_sale_id, event_type, notes, created_at)
  SELECT q.id, 'cancelled', '$REASON', NOW(3) FROM \`$N\`.sales_quick_sales q
  WHERE q.id IN (SELECT id FROM t_qs) AND q.status IN ('completed', 'draft');
UPDATE \`$N\`.sales_quick_sales SET status = 'cancelled', updated_at = NOW(3)
  WHERE id IN (SELECT id FROM t_qs) AND status IN ('completed', 'draft');
UPDATE \`$N\`.prc_supplier_invoices SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_sinv);
UPDATE \`$N\`.prc_supplier_payments SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_pay);
UPDATE \`$N\`.prc_purchase_orders SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_po);
UPDATE \`$N\`.prc_goods_receipts SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_grn);
UPDATE \`$N\`.inv_transactions SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_txn);
UPDATE \`$N\`.inv_opening_stocks SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_open);
-- 3) Test items' stock to 0 (signed quantity, as InventoryStockService.applyMovement), branch totals recomputed.
INSERT INTO \`$N\`.inv_movements (movement_date, txn_type, direction, product_id, warehouse_id, quantity, unit_cost,
    balance_after, doc_type, doc_ref, branch_id, notes, created_at)
  SELECT NOW(3), 'adjustment', IF(b.current_stock > 0, 'out', 'in'), b.product_id, b.warehouse_id, -b.current_stock,
         IFNULL(b.cost_price, 0), 0, 'test_data_cleanup', DATE_FORMAT(NOW(), '%Y%m%d'), b.branch_id, '$REASON', NOW(3)
  FROM t_bal b;
UPDATE \`$N\`.inv_stock_balances SET current_stock = 0, last_updated = NOW(3) WHERE product_id IN (SELECT id FROM t_inv);
UPDATE \`$N\`.inv_product_branches SET stock_quantity = 0, last_updated = NOW(3) WHERE product_id IN (SELECT id FROM t_inv);
-- 4) Master data.
UPDATE \`$N\`.cafe_products SET is_active = 0, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_cafe);
UPDATE \`$N\`.inv_products SET status = 'inactive', is_deleted = 1, updated_at = NOW(3) WHERE id IN (SELECT id FROM t_inv);
UPDATE \`$N\`.inv_supplier_products SET is_active = 0, updated_at = NOW(3)
  WHERE supplier_id = 1 OR product_id IN (SELECT id FROM t_inv);
UPDATE \`$N\`.inv_categories SET is_active = 0, is_deleted = 1, updated_at = NOW(3) WHERE id = 1;
UPDATE \`$N\`.inv_warehouses SET status = 'inactive', is_deleted = 1, updated_at = NOW(3) WHERE id IN ($TEST_WH);
UPDATE \`$N\`.inv_suppliers SET is_active = 0, is_deleted = 1, updated_at = NOW(3) WHERE id = 1;
COMMIT;
SQL
echo "=== after (all should be 0)"
mysql --batch --skip-column-names "$N" -e "$PREP $REPORT"
echo "=== accounts touched by the test entries: original + reversal per account (net should be 0)"
mysql --batch --skip-column-names "$N" -e "SET NAMES utf8mb4;
  SELECT a.code, a.name, SUM(l.debit) - SUM(l.credit) AS net FROM \`$N\`.acc_journal_entry_lines l
  JOIN \`$N\`.acc_journal_entries e ON e.id = l.entry_id JOIN \`$N\`.acc_accounts a ON a.id = l.account_id
  WHERE e.reversal_reason = '$REASON' OR e.id IN (SELECT reverses_id FROM \`$N\`.acc_journal_entries WHERE reversal_reason = '$REASON')
  GROUP BY a.code, a.name ORDER BY a.code;"
echo "CAFE TEST DATA HIDDEN"
echo "undo: gunzip -c $BACKUP | mysql $N"
