CREATE TABLE `inv_supplier_phones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `supplier_id` INTEGER NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `inv_supplier_phones_supplier_id_phone_key` (`supplier_id`, `phone`),
  INDEX `inv_supplier_phones_supplier_id_is_primary_idx` (`supplier_id`, `is_primary`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inv_supplier_phones_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `inv_suppliers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `inv_supplier_phones` (`supplier_id`, `phone`, `is_primary`, `sort_order`, `created_at`, `updated_at`)
SELECT `id`, TRIM(`phone`), true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `inv_suppliers`
WHERE `phone` IS NOT NULL AND TRIM(`phone`) <> '';

ALTER TABLE `inv_suppliers` DROP COLUMN `phone`;

ALTER TABLE `sales_quick_sales`
  MODIFY `status` ENUM('draft', 'completed', 'refunded', 'cancelled') NOT NULL DEFAULT 'completed',
  ADD COLUMN `receipt_comment` TEXT NULL AFTER `notes`;

CREATE TABLE `sales_invoice_feedback` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quick_sale_id` INTEGER NOT NULL,
  `rating` INTEGER NOT NULL,
  `comment` TEXT NULL,
  `feedback_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sales_invoice_feedback_quick_sale_id_key` (`quick_sale_id`),
  INDEX `sales_invoice_feedback_rating_idx` (`rating`),
  INDEX `sales_invoice_feedback_feedback_date_idx` (`feedback_date`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_invoice_feedback_quick_sale_id_fkey` FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sales_invoice_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quick_sale_id` INTEGER NOT NULL,
  `event_type` VARCHAR(30) NOT NULL,
  `notes` TEXT NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `sales_invoice_events_quick_sale_id_created_at_idx` (`quick_sale_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_invoice_events_quick_sale_id_fkey` FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
