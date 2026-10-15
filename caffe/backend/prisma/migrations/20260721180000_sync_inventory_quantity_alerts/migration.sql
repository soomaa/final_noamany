-- "تنبيه الكمية" is a single product-level setting in the UI. Keep the
-- legacy min_stock and reorder_point columns aligned for cafe inventory and
-- propagate the selected value to existing warehouse balances.
UPDATE `inv_products`
SET `reorder_point` = `min_stock`
WHERE `inventory_kind` IN ('raw_material', 'ready_product', 'manufactured_internal');

UPDATE `inv_stock_balances` AS balance
INNER JOIN `inv_products` AS product ON product.`id` = balance.`product_id`
SET
  balance.`min_stock` = product.`min_stock`,
  balance.`reorder_point` = product.`min_stock`
WHERE product.`inventory_kind` IN ('raw_material', 'ready_product', 'manufactured_internal');
