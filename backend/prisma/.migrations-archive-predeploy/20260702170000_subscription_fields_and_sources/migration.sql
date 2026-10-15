-- Extend shared ClubPaymentMethod enum to all tables using it
ALTER TABLE `club_subscriptions` MODIFY `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL;
ALTER TABLE `club_receipts` MODIFY `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL;
ALTER TABLE `club_locker_subscriptions` MODIFY `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL;
ALTER TABLE `club_event_payments` MODIFY `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL;

-- Add subscription source/contact fields
ALTER TABLE `club_subscriptions`
  ADD COLUMN `customer_source_id` INTEGER NULL,
  ADD COLUMN `guardian_name` VARCHAR(200) NULL,
  ADD COLUMN `guardian_phone` VARCHAR(20) NULL;

-- Customer sources lookup
CREATE TABLE `club_customer_sources` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `club_customer_sources` (`name`) VALUES
  ('Facebook'),
  ('Instagram'),
  ('صديق'),
  ('إعلان'),
  ('Google'),
  ('Walk-in')
ON DUPLICATE KEY UPDATE `name` = `name`;
