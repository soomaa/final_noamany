ALTER TABLE `club_subscription_types`
  ADD COLUMN `promo_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `promo_price` DECIMAL(10,2) NULL,
  ADD COLUMN `promo_discount_percent` DECIMAL(5,2) NULL,
  ADD COLUMN `promo_image` VARCHAR(255) NULL,
  ADD COLUMN `promo_ends_at` DATETIME(3) NULL,
  ADD COLUMN `promo_marketing_message` VARCHAR(160) NULL;

CREATE TABLE `am_payment_methods` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NULL,
  `provider` VARCHAR(40) NOT NULL DEFAULT 'other',
  `label` VARCHAR(120) NOT NULL,
  `value` VARCHAR(160) NOT NULL,
  `instructions` TEXT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `idx_app_payment_branch` (`branch_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_trainer_availability` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `trainer_id` INTEGER NOT NULL,
  `weekday` INTEGER NOT NULL,
  `start_time` VARCHAR(8) NOT NULL,
  `end_time` VARCHAR(8) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_trainer_availability_slot` (`trainer_id`, `weekday`, `start_time`),
  INDEX `club_trainer_availability_trainer_id_idx` (`trainer_id`),
  CONSTRAINT `club_trainer_availability_trainer_id_fkey`
    FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
