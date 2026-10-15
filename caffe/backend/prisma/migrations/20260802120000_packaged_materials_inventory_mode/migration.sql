ALTER TABLE `inv_products`
  MODIFY `cost_price` DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN `is_packaged` BOOLEAN NOT NULL DEFAULT FALSE AFTER `size`;

CREATE TABLE `inv_product_packages` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `package_size` DECIMAL(14, 3) NOT NULL,
  `package_unit` VARCHAR(20) NOT NULL,
  `package_base_quantity` DECIMAL(14, 3) NOT NULL,
  `package_price` DECIMAL(14, 2) NOT NULL,
  `reorder_point` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `uq_product_package_base_quantity` (`product_id`, `package_base_quantity`),
  INDEX `inv_product_packages_product_id_is_active_idx` (`product_id`, `is_active`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inv_product_packages_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `inv_products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `prc_supplier_invoice_items`
  ADD COLUMN `package_id` INTEGER NULL AFTER `product_id`,
  ADD INDEX `prc_supplier_invoice_items_package_id_idx` (`package_id`),
  ADD CONSTRAINT `prc_supplier_invoice_items_package_id_fkey`
    FOREIGN KEY (`package_id`) REFERENCES `inv_product_packages` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `inv_movements`
  MODIFY `unit_cost` DECIMAL(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE `inv_opening_stocks`
  MODIFY `unit_cost` DECIMAL(18, 6) NOT NULL;

ALTER TABLE `sales_quick_sales`
  ADD COLUMN `inventory_posted` BOOLEAN NOT NULL DEFAULT TRUE AFTER `receipt_printed`;
