#!/usr/bin/env bash
# Café menu from the old gym system (noamanycenter_noamany.store_item) into the new one, run ON THE
# SERVER as root:
#   bash fix-cafe-from-old.sh            # dry run: lists what would change, changes nothing
#   APPLY=1 bash fix-cafe-from-old.sh    # backup, then apply in one transaction
#
# The 2 Aug import copied the items (cafe_products LEG-CAFE-<old id> + inv_products L<old id>-<code>)
# but no categories, and the old menu changed after it. This:
# 1) puts every imported item in the café category of its old classification (store_item.sanf_type_gym:
#    7 عادى -> بار, 8 بروتين -> بروتين, 9 مستهلكات -> مستهلكات). These are the categories the new café
#    uses: the daily closing counts بار as normal and بروتين as protein sales, and a café invoice only
#    takes items of its chosen category. (The old menu groups مشروبات/مأكولات/… are display groups only;
#    a first run on 3 Nov used them, so this also hides those three categories again once empty.)
# 2) creates any of the three categories that is missing;
# 3) sets the sale price to the old system's current price (customer_price_sale), never to 0;
# 4) adds the items created in the old system after the import, in the same format;
# 5) copies names renamed in the old system since, and hides items the old system retired by renaming
#    them to zeros ("000", "00"; replaced there by new items).
# Items made in the new system (CP-…, CFM-…) are not touched. Prices are the same in every branch,
# as in the old system; the new café shows every active item in every branch.
set -euo pipefail
O="${OLD_DB:-noamanycenter_noamany}"
N="${NEW_DB:-noamanycenter_nest}"
APP="${APP:-/home/noamanycenter/final.noamanycenter.com}"
q() { mysql --batch --skip-column-names -e "$1"; }

# Old group (store_item.id_from) -> new category name_ar / name_en.
GROUP_NAME="CASE o.sanf_type_gym WHEN 7 THEN 'بار' WHEN 8 THEN 'بروتين' WHEN 9 THEN 'مستهلكات' END"
CATS="('بار','normal',1),('بروتين','proteen',2),('مستهلكات','mostahlkat',3)"
# Categories made by the first run on 3 Nov (old menu groups), hidden again when no item uses them.
FIRST_RUN_CATS="'مشروبات','مأكولات','اكسسورات'"

read -r -d '' PREP <<SQL || true
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP TEMPORARY TABLE IF EXISTS cafe_old;
CREATE TEMPORARY TABLE cafe_old AS
  SELECT o.id AS old_id, o.sanf_code, TRIM(o.name) AS name, o.customer_price_sale AS price, o.unit,
         o.sanf_type, o.sanf_type_gym, $GROUP_NAME AS cat_name,
         CONCAT('LEG-CAFE-', o.id) AS cafe_code, CONCAT('L', o.id, '-', o.sanf_code) AS inv_code
  FROM \`$O\`.store_item o WHERE o.id_from IN (1,2,3,4,5) AND o.sanf_type_gym IN (7,8,9);
DROP TEMPORARY TABLE IF EXISTS cafe_cats;
CREATE TEMPORARY TABLE cafe_cats (name_ar VARCHAR(100), name_en VARCHAR(100), sort_order INT) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO cafe_cats VALUES $CATS;
SQL

read -r -d '' REPORT <<SQL || true
SELECT 'categories to create', COUNT(*) FROM cafe_cats c
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.inv_categories x WHERE x.name_ar = c.name_ar AND x.is_deleted = 0);
SELECT 'items to add', COUNT(*) FROM cafe_old m
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.product_code = m.cafe_code);
SELECT 'items to put in their old category', COUNT(*) FROM cafe_old m
  JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code
  LEFT JOIN \`$N\`.inv_categories c ON c.name_ar = m.cat_name AND c.is_deleted = 0
  WHERE NOT (n.category_id <=> c.id);
SELECT 'prices to change', COUNT(*) FROM cafe_old m JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code
  WHERE m.price > 0 AND n.sell_price <> m.price;
SELECT 'names to update', COUNT(*) FROM cafe_old m JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code
  WHERE m.name <> '' AND m.name NOT REGEXP '^0+$' AND BINARY n.name <> BINARY m.name;
SELECT 'retired in old (name 000), to hide', COUNT(*) FROM cafe_old m JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code
  WHERE m.name REGEXP '^0+$' AND n.is_active = 1;
SELECT 'first-run categories to hide', COUNT(*) FROM \`$N\`.inv_categories c WHERE c.name_ar IN ($FIRST_RUN_CATS) AND c.is_deleted = 0;
SELECT 'old price 0 (price kept)', COUNT(*) FROM cafe_old m JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code
  WHERE IFNULL(m.price, 0) = 0;
SQL

echo "=== summary"
mysql --batch --skip-column-names "$N" -e "$PREP $REPORT"
echo "=== items to add (old id, name, category, price)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT old_id, name, cat_name, price FROM cafe_old m
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.product_code = m.cafe_code) ORDER BY old_id;"
echo "=== renamed in old (old id, new system now -> old system name)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT m.old_id, n.name, m.name FROM cafe_old m
  JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code WHERE BINARY n.name <> BINARY m.name ORDER BY m.old_id;"
echo "=== price changes (old id, name, new system now -> old system price)"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT m.old_id, m.name, n.sell_price, m.price FROM cafe_old m
  JOIN \`$N\`.cafe_products n ON n.product_code = m.cafe_code WHERE m.price > 0 AND n.sell_price <> m.price ORDER BY m.old_id;"
echo "=== items per category after the change"
mysql --batch --skip-column-names "$N" -e "$PREP SELECT cat_name, COUNT(*) FROM cafe_old GROUP BY cat_name ORDER BY MIN(old_id);"
[ "${APPLY:-0}" = 1 ] || { echo "DRY RUN: nothing changed (run with APPLY=1 to apply)"; exit 0; }

mkdir -p "$APP/tmp"
BACKUP="$APP/tmp/cafe-before-old-menu-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump --single-transaction --skip-triggers --set-gtid-purged=OFF "$N" inv_categories inv_products cafe_products | gzip > "$BACKUP"
echo "backup: $BACKUP"

mysql "$N" <<SQL
$PREP
START TRANSACTION;
INSERT INTO \`$N\`.inv_categories (name_ar, name_en, is_active, is_deleted, sort_order, created_at, updated_at)
  SELECT c.name_ar, c.name_en, 1, 0, c.sort_order, NOW(3), NOW(3) FROM cafe_cats c
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.inv_categories x WHERE x.name_ar = c.name_ar AND x.is_deleted = 0);
-- Items added in the old system after the import: same codes and fields as the import used.
INSERT INTO \`$N\`.inv_products (product_code, name_ar, description, category_id, cost_price, selling_price,
    unit_of_measure, min_stock, max_stock, reorder_point, apply_to_all_branches, status, is_deleted,
    created_at, updated_at, inventory_kind, inventory_section, is_packaged)
  SELECT m.inv_code, m.name,
         JSON_OBJECT('legacy_id', m.old_id, 'legacy_type', CAST(m.sanf_type AS CHAR), 'legacy_table', 'store_item',
                     'original_code', CAST(m.sanf_code AS CHAR), 'legacy_gym_type', m.sanf_type_gym, 'opening_quantity', ''),
         c.id, 0, m.price, IFNULL(NULLIF(m.unit, ''), '1'), 0, 1000, 0, 0, 'active', 0, NOW(3), NOW(3), 'cafe', 'cafe', 0
  FROM cafe_old m JOIN \`$N\`.inv_categories c ON c.name_ar = m.cat_name AND c.is_deleted = 0
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.product_code = m.cafe_code)
    AND NOT EXISTS (SELECT 1 FROM \`$N\`.inv_products i WHERE i.product_code = m.inv_code);
INSERT INTO \`$N\`.cafe_products (product_code, name, category_id, sell_price, is_active, created_at, updated_at,
    product_type, inventory_product_id)
  SELECT m.cafe_code, m.name, c.id, m.price, 1, NOW(3), NOW(3), 'ready', i.id
  FROM cafe_old m JOIN \`$N\`.inv_categories c ON c.name_ar = m.cat_name AND c.is_deleted = 0
  JOIN \`$N\`.inv_products i ON i.product_code = m.inv_code
  WHERE NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.product_code = m.cafe_code);
-- Category and price on the imported items (and their inventory rows).
UPDATE \`$N\`.cafe_products n JOIN cafe_old m ON n.product_code = m.cafe_code
  JOIN \`$N\`.inv_categories c ON c.name_ar = m.cat_name AND c.is_deleted = 0
  SET n.category_id = c.id;
UPDATE \`$N\`.inv_products i JOIN \`$N\`.cafe_products n ON n.inventory_product_id = i.id
  JOIN cafe_old m ON n.product_code = m.cafe_code
  SET i.category_id = n.category_id;
UPDATE \`$N\`.cafe_products n JOIN cafe_old m ON n.product_code = m.cafe_code
  SET n.sell_price = m.price WHERE m.price > 0 AND n.sell_price <> m.price;
UPDATE \`$N\`.inv_products i JOIN \`$N\`.cafe_products n ON n.inventory_product_id = i.id
  JOIN cafe_old m ON n.product_code = m.cafe_code
  SET i.selling_price = m.price WHERE m.price > 0 AND i.selling_price <> m.price;
UPDATE \`$N\`.cafe_products n JOIN cafe_old m ON n.product_code = m.cafe_code
  SET n.name = m.name WHERE m.name <> '' AND m.name NOT REGEXP '^0+$' AND BINARY n.name <> BINARY m.name;
UPDATE \`$N\`.inv_products i JOIN \`$N\`.cafe_products n ON n.inventory_product_id = i.id
  JOIN cafe_old m ON n.product_code = m.cafe_code
  SET i.name_ar = n.name WHERE BINARY i.name_ar <> BINARY n.name;
UPDATE \`$N\`.cafe_products n JOIN cafe_old m ON n.product_code = m.cafe_code
  SET n.is_active = 0 WHERE m.name REGEXP '^0+$';
UPDATE \`$N\`.inv_categories c SET c.is_active = 0, c.is_deleted = 1, c.updated_at = NOW(3)
  WHERE c.name_ar IN ($FIRST_RUN_CATS) AND c.is_deleted = 0
    AND NOT EXISTS (SELECT 1 FROM \`$N\`.cafe_products n WHERE n.category_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM \`$N\`.inv_products i WHERE i.category_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM \`$N\`.sales_quick_sales q WHERE q.cafe_category_id = c.id);
COMMIT;
SQL
echo "=== after (all should be 0 except old price 0)"
mysql --batch --skip-column-names "$N" -e "$PREP $REPORT"
echo "CAFE MENU FROM OLD SYSTEM APPLIED"
echo "undo: gunzip -c $BACKUP | mysql $N"
