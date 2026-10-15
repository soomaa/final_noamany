CREATE TABLE `club_discount_codes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(80) NOT NULL,
  `percentage` DECIMAL(6,3) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `club_discount_codes_code_key`(`code`),
  INDEX `club_discount_codes_is_active_idx`(`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `discount_code_id` INTEGER NULL,
  ADD COLUMN `discount_percentage` DECIMAL(6,3) NULL,
  ADD INDEX `club_subscriptions_discount_code_id_idx`(`discount_code_id`);

ALTER TABLE `club_locker_subscriptions`
  ADD COLUMN `discount_code_id` INTEGER NULL,
  ADD COLUMN `discount_percentage` DECIMAL(6,3) NULL,
  ADD INDEX `club_locker_subscriptions_discount_code_id_idx`(`discount_code_id`);

ALTER TABLE `club_receipts`
  ADD COLUMN `locker_subscription_id` INTEGER NULL,
  ADD INDEX `club_receipts_locker_subscription_id_idx`(`locker_subscription_id`);

ALTER TABLE `club_subscription_transfers`
  ADD COLUMN `destination_subscription_id` INTEGER NULL,
  ADD COLUMN `consumed_value` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `credit_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `additional_paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `destination_sessions_count` INTEGER NULL,
  ADD COLUMN `difference_payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet', 'instapay') NULL,
  ADD INDEX `club_subscription_transfers_destination_subscription_id_idx`(`destination_subscription_id`);

UPDATE `club_receipts` r
JOIN `club_locker_subscriptions` s ON s.`receipt_number` = r.`receipt_number`
SET r.`locker_subscription_id` = s.`id`
WHERE r.`locker_subscription_id` IS NULL;

ALTER TABLE `club_subscriptions`
  ADD CONSTRAINT `club_subscriptions_discount_code_id_fkey`
  FOREIGN KEY (`discount_code_id`) REFERENCES `club_discount_codes`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `club_locker_subscriptions`
  ADD CONSTRAINT `club_locker_subscriptions_discount_code_id_fkey`
  FOREIGN KEY (`discount_code_id`) REFERENCES `club_discount_codes`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `club_receipts`
  ADD CONSTRAINT `club_receipts_locker_subscription_id_fkey`
  FOREIGN KEY (`locker_subscription_id`) REFERENCES `club_locker_subscriptions`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `club_subscription_transfers`
  ADD CONSTRAINT `club_subscription_transfers_destination_subscription_id_fkey`
  FOREIGN KEY (`destination_subscription_id`) REFERENCES `club_subscriptions`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

