-- Link every booking payment/refund to the shift that physically handled the money.
ALTER TABLE `sales_booking_payments`
  ADD COLUMN `shift_session_id` INTEGER NULL;

CREATE INDEX `sales_booking_payments_shift_session_id_idx`
  ON `sales_booking_payments`(`shift_session_id`);

ALTER TABLE `sales_booking_payments`
  ADD CONSTRAINT `sales_booking_payments_shift_session_id_fkey`
  FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

-- Safe best-effort backfill for historical payments. The actual session interval is
-- authoritative; unmatched legacy rows remain unlinked instead of being guessed by
-- the booking appointment time.
UPDATE `sales_booking_payments` AS `payment`
JOIN `sales_bookings` AS `booking` ON `booking`.`id` = `payment`.`booking_id`
SET `payment`.`shift_session_id` = (
  SELECT `session`.`id`
  FROM `sales_shift_sessions` AS `session`
  WHERE `session`.`branch_id` = `booking`.`branch_id`
    AND `session`.`session_date` = `payment`.`payment_date`
    AND `session`.`start_time` <= `payment`.`created_at`
    AND (`session`.`end_time` IS NULL OR `session`.`end_time` >= `payment`.`created_at`)
  ORDER BY `session`.`start_time` DESC, `session`.`id` DESC
  LIMIT 1
)
WHERE `payment`.`shift_session_id` IS NULL;

-- Preserve legacy POS sales only when a real session can be proven from the sale
-- timestamp and cashier identity. This replaces the unsafe runtime time-window guess.
UPDATE `sales_quick_sales` AS `sale`
SET `sale`.`shift_session_id` = (
  SELECT `session`.`id`
  FROM `sales_shift_sessions` AS `session`
  WHERE `session`.`branch_id` = `sale`.`branch_id`
    AND `session`.`session_date` = `sale`.`sale_date`
    AND (`sale`.`cashier_id` IS NULL OR `session`.`user_id` = `sale`.`cashier_id`)
    AND `session`.`start_time` <= `sale`.`created_at`
    AND (`session`.`end_time` IS NULL OR `session`.`end_time` >= `sale`.`created_at`)
  ORDER BY `session`.`start_time` DESC, `session`.`id` DESC
  LIMIT 1
)
WHERE `sale`.`shift_session_id` IS NULL;

