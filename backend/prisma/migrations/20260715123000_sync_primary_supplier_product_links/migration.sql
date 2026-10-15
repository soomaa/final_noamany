-- Existing raw materials may already have a primary supplier selected on
-- inv_products but no row in inv_supplier_products. Cafe purchases read the
-- relation table, so backfill/reactivate those links without touching stock,
-- invoices, members, or subscriptions.
INSERT INTO `inv_supplier_products` (
  `supplier_id`,
  `product_id`,
  `purchase_unit`,
  `is_active`,
  `created_at`,
  `updated_at`
)
SELECT
  p.`supplier_id`,
  p.`id`,
  p.`unit_of_measure`,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `inv_products` p
INNER JOIN `inv_suppliers` s
  ON s.`id` = p.`supplier_id`
  AND s.`is_deleted` = FALSE
WHERE p.`supplier_id` IS NOT NULL
  AND p.`inventory_kind` = 'raw_material'
  AND p.`is_deleted` = FALSE
ON DUPLICATE KEY UPDATE
  `is_active` = TRUE,
  `purchase_unit` = COALESCE(`inv_supplier_products`.`purchase_unit`, VALUES(`purchase_unit`)),
  `updated_at` = CURRENT_TIMESTAMP;
