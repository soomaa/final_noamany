ALTER TABLE `club_trainer_commission_settings`
  ADD COLUMN `commission_mode` VARCHAR(20) NOT NULL DEFAULT 'attendance',
  ADD COLUMN `private_commission_mode` VARCHAR(20) NOT NULL DEFAULT 'salary',
  ADD COLUMN `private_commission_percent` DECIMAL(6,3) NOT NULL DEFAULT 0;

-- Preserve ONE80's existing visible tier-based trainer workspace for configured rows.
UPDATE `club_trainer_commission_settings` AS settings
SET settings.`commission_mode` = 'tiered'
WHERE EXISTS (
  SELECT 1
  FROM `club_trainer_commission_tiers` AS tier
  WHERE tier.`settings_id` = settings.`id`
);

ALTER TABLE `club_private_attendance_commissions`
  ADD COLUMN `refunded_amount` DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE `club_subscription_refunds`
  ADD COLUMN `completed_at` DATETIME(3) NULL;

ALTER TABLE `club_trainer_ratings`
  ADD COLUMN `attendance_id` INTEGER NULL,
  ADD UNIQUE INDEX `club_trainer_ratings_attendance_id_key` (`attendance_id`),
  ADD CONSTRAINT `club_trainer_ratings_attendance_id_fkey`
    FOREIGN KEY (`attendance_id`) REFERENCES `club_attendance` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `club_trainer_receipt_commissions` (
  `receipt_id` INTEGER NOT NULL,
  `trainer_id` INTEGER NOT NULL,
  `receipt_date` VARCHAR(10) NOT NULL,
  `base_amount` DECIMAL(14,2) NOT NULL,
  `commission_amount` DECIMAL(14,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`receipt_id`),
  INDEX `club_trainer_receipt_commissions_trainer_id_receipt_date_idx` (`trainer_id`, `receipt_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_trainer_subscription_refund_commissions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `refund_id` INTEGER NOT NULL,
  `subscription_id` INTEGER NOT NULL,
  `trainer_id` INTEGER NOT NULL,
  `refund_date` VARCHAR(10) NOT NULL,
  `base_amount` DECIMAL(14,2) NOT NULL,
  `commission_amount` DECIMAL(14,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_trainer_refund_commission` (`refund_id`, `trainer_id`),
  INDEX `idx_trainer_refund_date` (`trainer_id`, `refund_date`),
  INDEX `idx_trainer_refund_subscription` (`subscription_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
