ALTER TABLE `club_subscriptions`
  ADD COLUMN `waived_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER `paid_amount`;

CREATE TABLE `club_subscription_waivers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subscription_id` INTEGER NOT NULL,
  `member_id` INTEGER NULL,
  `member_name` VARCHAR(200) NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `waiver_date` VARCHAR(10) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_subscription_waivers_subscription_id_idx` (`subscription_id`),
  INDEX `club_subscription_waivers_member_id_idx` (`member_id`),
  INDEX `club_subscription_waivers_waiver_date_idx` (`waiver_date`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_subscription_waivers_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions` (`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_class_types`
  ADD COLUMN `single_session_price` DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER `default_duration_minutes`;

CREATE TABLE `club_trainer_schedule_slots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `trainer_id` INTEGER NOT NULL,
  `weekday` INTEGER NOT NULL,
  `start_time` VARCHAR(8) NOT NULL,
  `end_time` VARCHAR(8) NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `hall_id` INTEGER NULL,
  `max_capacity` INTEGER NOT NULL DEFAULT 10,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `uq_trainer_weekly_slot` (`trainer_id`, `weekday`, `start_time`, `branch_id`),
  INDEX `club_trainer_schedule_slots_trainer_id_weekday_idx` (`trainer_id`, `weekday`),
  INDEX `club_trainer_schedule_slots_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_trainer_schedule_slots_trainer_id_fkey`
    FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `club_trainer_schedule_slots_hall_id_fkey`
    FOREIGN KEY (`hall_id`) REFERENCES `club_halls` (`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_classes`
  ADD COLUMN `trainer_schedule_slot_id` INTEGER NULL AFTER `template_slot_id`,
  ADD INDEX `club_classes_trainer_schedule_slot_id_idx` (`trainer_schedule_slot_id`),
  ADD CONSTRAINT `club_classes_trainer_schedule_slot_id_fkey`
    FOREIGN KEY (`trainer_schedule_slot_id`) REFERENCES `club_trainer_schedule_slots` (`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `club_trainer_earning_payments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `trainer_id` INTEGER NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `payment_date` VARCHAR(10) NOT NULL,
  `notes` VARCHAR(500) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_trainer_earning_payments_trainer_id_idx` (`trainer_id`),
  INDEX `club_trainer_earning_payments_payment_date_idx` (`payment_date`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_trainer_earning_payments_trainer_id_fkey`
    FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
