-- Operational integrity for daily Cafe purchasing and supplier payments.
ALTER TABLE `prc_supplier_invoices`
  ADD COLUMN `supplier_invoice_number` VARCHAR(100) NULL AFTER `invoice_number`,
  ADD COLUMN `attachment_url` VARCHAR(500) NULL AFTER `supplier_invoice_number`,
  ADD UNIQUE INDEX `uq_supplier_external_invoice` (`supplier_id`, `supplier_invoice_number`);

ALTER TABLE `prc_supplier_payments`
  ADD COLUMN `branch_id` INTEGER NULL AFTER `invoice_id`,
  ADD INDEX `prc_supplier_payments_branch_id_idx` (`branch_id`);

UPDATE `prc_supplier_payments` p
JOIN `prc_supplier_invoices` i ON i.id = p.invoice_id
SET p.branch_id = i.branch_id
WHERE p.branch_id IS NULL;

-- Fractional reorder thresholds are required for kg/litre based ingredients.
ALTER TABLE `inv_products`
  MODIFY COLUMN `min_stock` DECIMAL(14,3) NOT NULL DEFAULT 1,
  MODIFY COLUMN `max_stock` DECIMAL(14,3) NOT NULL DEFAULT 1000,
  MODIFY COLUMN `reorder_point` DECIMAL(14,3) NOT NULL DEFAULT 10;

ALTER TABLE `inv_stock_balances`
  MODIFY COLUMN `min_stock` DECIMAL(14,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `max_stock` DECIMAL(14,3) NOT NULL DEFAULT 1000,
  MODIFY COLUMN `reorder_point` DECIMAL(14,3) NOT NULL DEFAULT 10;

ALTER TABLE `inv_product_branches`
  MODIFY COLUMN `reorder_point` DECIMAL(14,3) NOT NULL DEFAULT 10;

-- Every custom POS label has an explicit accounting method. Never infer it from a free-form code.
ALTER TABLE `sales_pos_payment_methods`
  ADD COLUMN `base_method` ENUM('cash','card','wallet','transfer','mixed') NOT NULL DEFAULT 'card' AFTER `code`,
  ADD INDEX `sales_pos_payment_methods_base_method_idx` (`base_method`);

UPDATE `sales_pos_payment_methods`
SET `base_method` = CASE
  WHEN LOWER(`code`) = 'cash' THEN 'cash'
  WHEN LOWER(`code`) = 'wallet' THEN 'wallet'
  WHEN LOWER(`code`) IN ('transfer', 'bank_transfer') THEN 'transfer'
  ELSE 'card'
END;

-- Heal legacy ready inventory items that existed before the Cafe/POS linkage was introduced.
INSERT IGNORE INTO `cafe_products`
  (`product_code`, `name`, `category_id`, `product_type`, `inventory_product_id`, `sell_price`, `image_url`, `is_active`, `created_at`, `updated_at`)
SELECT
  CONCAT('CF-INV-', p.`id`), p.`name_ar`, p.`category_id`, 'ready', p.`id`, p.`selling_price`, p.`image_url`,
  IF(p.`status` = 'active' AND p.`is_deleted` = 0, 1, 0), NOW(), NOW()
FROM `inv_products` p
LEFT JOIN `cafe_products` cp ON cp.`inventory_product_id` = p.`id`
WHERE p.`inventory_kind` = 'ready_product' AND cp.`id` IS NULL;
