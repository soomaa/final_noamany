-- Cafe ready products are stock items. Keep every existing linked inventory
-- product in the dedicated ready-products section so the inventory, supplier
-- and purchasing workflows all see the same item.
UPDATE `inv_products` AS inventory_product
INNER JOIN `cafe_products` AS cafe_product
  ON cafe_product.`inventory_product_id` = inventory_product.`id`
SET
  inventory_product.`inventory_kind` = 'ready_product',
  inventory_product.`inventory_section` = 'ready_products'
WHERE cafe_product.`product_type` = 'ready';
