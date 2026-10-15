CREATE TABLE `club_private_packages` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `kind` ENUM('subscription', 'sessions') NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `duration_days` INTEGER NOT NULL,
  `sessions_count` INTEGER NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `legacy_subscription_type_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `uq_private_packages_legacy_subscription_type` (`legacy_subscription_type_id`),
  INDEX `club_private_packages_kind_is_active_idx` (`kind`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_private_package_branches` (
  `package_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_private_package_branches_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`package_id`, `branch_id`),
  CONSTRAINT `club_private_package_branches_package_id_fkey`
    FOREIGN KEY (`package_id`) REFERENCES `club_private_packages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `private_package_id` INTEGER NULL,
  ADD COLUMN `private_trainer_id` INTEGER NULL,
  ADD COLUMN `private_discount_type` VARCHAR(80) NULL,
  ADD INDEX `club_subscriptions_private_package_id_idx` (`private_package_id`),
  ADD INDEX `club_subscriptions_private_trainer_id_idx` (`private_trainer_id`),
  ADD CONSTRAINT `club_subscriptions_private_package_id_fkey`
    FOREIGN KEY (`private_package_id`) REFERENCES `club_private_packages` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_subscriptions_private_trainer_id_fkey`
    FOREIGN KEY (`private_trainer_id`) REFERENCES `club_trainers` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `club_private_attendance_commissions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `attendance_id` INTEGER NOT NULL,
  `subscription_id` INTEGER NOT NULL,
  `trainer_id` INTEGER NOT NULL,
  `commission_sequence` INTEGER NOT NULL,
  `attendance_date` VARCHAR(10) NOT NULL,
  `revenue_base` DECIMAL(10,2) NOT NULL,
  `commission_percentage` DECIMAL(5,2) NOT NULL,
  `commission_amount` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `club_private_attendance_commissions_attendance_id_key` (`attendance_id`),
  UNIQUE INDEX `uq_private_sub_commission_sequence` (`subscription_id`, `commission_sequence`),
  INDEX `private_commission_trainer_date_idx` (`trainer_id`, `attendance_date`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_private_attendance_commissions_attendance_id_fkey`
    FOREIGN KEY (`attendance_id`) REFERENCES `club_attendance` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `club_private_attendance_commissions_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `club_private_attendance_commissions_trainer_id_fkey`
    FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
