-- Purpose-based sections keep cafe ingredients, serving supplies, gym supplies,
-- and ready products separate without overloading inventory_kind.
ALTER TABLE `inv_products`
  ADD COLUMN `inventory_section` VARCHAR(40) NOT NULL DEFAULT 'general' AFTER `inventory_kind`;

UPDATE `inv_products`
SET `inventory_section` = CASE
  WHEN `inventory_kind` = 'raw_material' THEN 'preparation_ingredients'
  WHEN `inventory_kind` = 'ready_product' THEN 'ready_products'
  ELSE 'general'
END;

CREATE INDEX `inv_products_inventory_section_idx`
  ON `inv_products` (`inventory_section`);

-- Every branch has a human-friendly sequence starting from 1 each business day.
ALTER TABLE `sales_quick_sales`
  ADD COLUMN `daily_number` INTEGER NULL AFTER `sale_number`;

UPDATE `sales_quick_sales` AS sale
JOIN (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `branch_id`, `sale_date`
      ORDER BY `id`
    ) AS `seq`
  FROM `sales_quick_sales`
) AS numbered ON numbered.`id` = sale.`id`
SET sale.`daily_number` = numbered.`seq`;

ALTER TABLE `sales_quick_sales`
  MODIFY `daily_number` INTEGER NOT NULL;

CREATE UNIQUE INDEX `uq_quick_sale_daily_number`
  ON `sales_quick_sales` (`branch_id`, `sale_date`, `daily_number`);

CREATE TABLE `sales_invoice_item_feedback` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quick_sale_id` INTEGER NOT NULL,
  `quick_sale_item_id` INTEGER NOT NULL,
  `rating` INTEGER NOT NULL,
  `comment` TEXT NULL,
  `feedback_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `sales_invoice_item_feedback_quick_sale_item_id_key` (`quick_sale_item_id`),
  INDEX `sales_invoice_item_feedback_quick_sale_id_rating_idx` (`quick_sale_id`, `rating`),
  INDEX `sales_invoice_item_feedback_feedback_date_idx` (`feedback_date`),
  CONSTRAINT `sales_invoice_item_feedback_quick_sale_id_fkey`
    FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `sales_invoice_item_feedback_quick_sale_item_id_fkey`
    FOREIGN KEY (`quick_sale_item_id`) REFERENCES `sales_quick_sale_items` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
