ALTER TABLE `inv_products`
  ADD COLUMN `inventory_kind` VARCHAR(30) NOT NULL DEFAULT 'general';

ALTER TABLE `inv_suppliers`
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `rating` DECIMAL(3,2) NULL;

CREATE TABLE `inv_supplier_products` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `supplier_id` INTEGER NOT NULL,
  `product_id` INTEGER NOT NULL,
  `purchase_unit` VARCHAR(50) NULL,
  `last_unit_cost` DECIMAL(12,4) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `inv_supplier_products_supplier_id_product_id_key` (`supplier_id`, `product_id`),
  INDEX `inv_supplier_products_product_id_idx` (`product_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inv_supplier_products_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `inv_suppliers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `inv_supplier_products_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cafe_products`
  ADD COLUMN `product_type` VARCHAR(20) NOT NULL DEFAULT 'prepared',
  ADD COLUMN `inventory_product_id` INTEGER NULL,
  ADD UNIQUE INDEX `cafe_products_inventory_product_id_key` (`inventory_product_id`),
  ADD CONSTRAINT `cafe_products_inventory_product_id_fkey` FOREIGN KEY (`inventory_product_id`) REFERENCES `inv_products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `prc_supplier_invoices`
  ADD COLUMN `warehouse_id` INTEGER NULL,
  ADD COLUMN `stock_applied` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `stocked_at` DATETIME(3) NULL;

ALTER TABLE `prc_supplier_invoice_items`
  ADD COLUMN `unit` VARCHAR(50) NULL,
  ADD COLUMN `base_quantity` DECIMAL(14,3) NULL;

ALTER TABLE `inv_count_items`
  ADD COLUMN `variance_reason` VARCHAR(255) NULL;

ALTER TABLE `sales_quick_sales`
  ADD COLUMN `sale_type` VARCHAR(20) NOT NULL DEFAULT 'customer',
  ADD COLUMN `employee_id` INTEGER NULL,
  ADD COLUMN `partner_id` INTEGER NULL,
  ADD COLUMN `collected_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `cost_total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD INDEX `sales_quick_sales_sale_type_idx` (`sale_type`),
  ADD INDEX `sales_quick_sales_partner_id_idx` (`partner_id`),
  ADD INDEX `sales_quick_sales_employee_id_idx` (`employee_id`);

ALTER TABLE `sales_quick_sale_items`
  ADD COLUMN `cafe_product_id` INTEGER NULL,
  ADD COLUMN `inventory_product_id` INTEGER NULL,
  ADD COLUMN `unit_cost` DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN `line_cost` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD INDEX `sales_quick_sale_items_cafe_product_id_idx` (`cafe_product_id`),
  ADD INDEX `sales_quick_sale_items_inventory_product_id_idx` (`inventory_product_id`);

CREATE TABLE `cafe_partners` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `cafe_partners_name_idx` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
