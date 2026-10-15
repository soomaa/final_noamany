CREATE TABLE `cafe_waste_reasons` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cafe_waste_reasons_name_key` (`name`),
  INDEX `cafe_waste_reasons_is_active_idx` (`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cafe_waste_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(100) NOT NULL,
  `request_id` VARCHAR(36) NOT NULL,
  `transaction_id` INT NOT NULL,
  `reversal_transaction_id` INT NULL,
  `branch_id` INT NOT NULL,
  `warehouse_id` INT NOT NULL,
  `source_kind` VARCHAR(30) NOT NULL,
  `inventory_product_id` INT NULL,
  `cafe_product_id` INT NULL,
  `cafe_variant_id` INT NULL,
  `package_id` INT NULL,
  `package_label` VARCHAR(100) NULL,
  `source_name` VARCHAR(255) NOT NULL,
  `component_snapshot` JSON NOT NULL,
  `quantity` DECIMAL(14, 3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL,
  `reason_id` INT NULL,
  `reason_name` VARCHAR(120) NOT NULL,
  `notes` TEXT NULL,
  `total_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `allow_negative` BOOLEAN NOT NULL DEFAULT false,
  `created_by` INT NULL,
  `reversed_by` INT NULL,
  `reversed_at` DATETIME(3) NULL,
  `reversal_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cafe_waste_records_reference_key` (`reference`),
  UNIQUE INDEX `cafe_waste_records_request_id_key` (`request_id`),
  UNIQUE INDEX `cafe_waste_records_transaction_id_key` (`transaction_id`),
  UNIQUE INDEX `cafe_waste_records_reversal_transaction_id_key` (`reversal_transaction_id`),
  INDEX `cafe_waste_records_branch_id_created_at_idx` (`branch_id`, `created_at`),
  INDEX `cafe_waste_records_reason_id_created_at_idx` (`reason_id`, `created_at`),
  INDEX `cafe_waste_records_source_kind_inventory_product_id_idx` (`source_kind`, `inventory_product_id`),
  INDEX `cafe_waste_records_status_created_at_idx` (`status`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cafe_waste_records_reason_id_fkey` FOREIGN KEY (`reason_id`) REFERENCES `cafe_waste_reasons`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `cafe_waste_records_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `inv_transactions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `cafe_waste_records_reversal_transaction_id_fkey` FOREIGN KEY (`reversal_transaction_id`) REFERENCES `inv_transactions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `cafe_waste_reasons` (`name`, `is_active`, `created_at`, `updated_at`)
VALUES
  ('انتهاء الصلاحية', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('تلف أثناء التحضير', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('سوء التخزين', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('جودة غير مطابقة', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('خطأ في الطلب', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
