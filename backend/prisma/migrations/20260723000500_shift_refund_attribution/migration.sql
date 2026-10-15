-- Refunds and completed-sale cancellations are financial events of the shift that
-- performs them. Store their signed breakdown explicitly so closed/open shift totals
-- can be rebuilt without changing the original sale's historical ownership.
CREATE TABLE `sales_shift_sale_adjustments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shift_session_id` INTEGER NOT NULL,
  `quick_sale_id` INTEGER NOT NULL,
  `event_type` VARCHAR(20) NOT NULL,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `cash_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `card_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `wallet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `transfer_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `sales_shift_sale_adjustments_quick_sale_id_key`(`quick_sale_id`),
  INDEX `sales_shift_sale_adjustments_shift_session_id_created_at_idx`(`shift_session_id`, `created_at`),
  INDEX `sales_shift_sale_adjustments_event_type_idx`(`event_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sales_shift_sale_adjustments`
  ADD CONSTRAINT `sales_shift_sale_adjustments_shift_session_id_fkey`
  FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `sales_shift_sale_adjustments`
  ADD CONSTRAINT `sales_shift_sale_adjustments_quick_sale_id_fkey`
  FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Historical reversals were applied to their original session. Preserve those net
-- totals while moving them to the explicit model used by the corrected runtime.
INSERT INTO `sales_shift_sale_adjustments` (
  `shift_session_id`, `quick_sale_id`, `event_type`, `total_amount`,
  `cash_amount`, `card_amount`, `wallet_amount`, `transfer_amount`,
  `discount_amount`, `tax_amount`, `created_by`, `created_at`
)
SELECT
  `sale`.`shift_session_id`,
  `sale`.`id`,
  CASE WHEN `sale`.`status` = 'refunded' THEN 'refund' ELSE 'cancel' END,
  `sale`.`total_amount`,
  CASE
    WHEN `sale`.`payment_method` = 'cash' THEN `sale`.`collected_amount`
    WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`cash_amount`, 0)
    ELSE 0
  END,
  CASE
    WHEN `sale`.`payment_method` = 'card' THEN `sale`.`collected_amount`
    WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`card_amount`, 0)
    ELSE 0
  END,
  CASE
    WHEN `sale`.`payment_method` = 'wallet' THEN `sale`.`collected_amount`
    WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`wallet_amount`, 0)
    ELSE 0
  END,
  CASE
    WHEN `sale`.`payment_method` = 'transfer' THEN `sale`.`collected_amount`
    WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`transfer_amount`, 0)
    ELSE 0
  END,
  `sale`.`discount_amount`,
  `sale`.`tax_amount`,
  COALESCE(`event`.`created_by`, `sale`.`created_by`),
  COALESCE(`event`.`created_at`, `sale`.`updated_at`)
FROM `sales_quick_sales` AS `sale`
LEFT JOIN (
  SELECT
    `quick_sale_id`,
    SUM(CASE WHEN `method` = 'cash' THEN `amount` ELSE 0 END) AS `cash_amount`,
    SUM(CASE WHEN `method` = 'card' THEN `amount` ELSE 0 END) AS `card_amount`,
    SUM(CASE WHEN `method` = 'wallet' THEN `amount` ELSE 0 END) AS `wallet_amount`,
    SUM(CASE WHEN `method` = 'transfer' THEN `amount` ELSE 0 END) AS `transfer_amount`
  FROM `sales_pos_payments`
  GROUP BY `quick_sale_id`
) AS `payment` ON `payment`.`quick_sale_id` = `sale`.`id`
LEFT JOIN (
  SELECT `quick_sale_id`, MAX(`id`) AS `event_id`
  FROM `sales_invoice_events`
  WHERE `event_type` IN ('refunded', 'cancelled')
  GROUP BY `quick_sale_id`
) AS `last_event` ON `last_event`.`quick_sale_id` = `sale`.`id`
LEFT JOIN `sales_invoice_events` AS `event` ON `event`.`id` = `last_event`.`event_id`
WHERE `sale`.`status` IN ('refunded', 'cancelled')
  AND `sale`.`shift_session_id` IS NOT NULL;

