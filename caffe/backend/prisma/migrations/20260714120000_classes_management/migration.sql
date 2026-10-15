-- Separate reusable class definitions/default weekly templates from actual dated sessions.
CREATE TABLE `club_class_types` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `color` VARCHAR(20) NOT NULL DEFAULT '#2563EB',
  `default_duration_minutes` INT NOT NULL DEFAULT 60,
  `use_default_schedule` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `is_deleted` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `club_class_types_name_key` (`name`),
  INDEX `club_class_types_is_active_is_deleted_idx` (`is_active`, `is_deleted`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_class_type_trainers` (
  `class_type_id` INT NOT NULL,
  `trainer_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_class_type_trainers_trainer_id_idx` (`trainer_id`),
  PRIMARY KEY (`class_type_id`, `trainer_id`),
  CONSTRAINT `club_class_type_trainers_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `club_class_types` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `club_class_type_trainers_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_class_schedule_slots` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `class_type_id` INT NOT NULL,
  `weekday` INT NOT NULL,
  `start_time` VARCHAR(8) NOT NULL,
  `end_time` VARCHAR(8) NOT NULL,
  `branch_id` INT NOT NULL,
  `hall_id` INT NULL,
  `trainer_id` INT NULL,
  `max_capacity` INT NOT NULL DEFAULT 10,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `club_class_schedule_slots_class_type_id_weekday_idx` (`class_type_id`, `weekday`),
  INDEX `club_class_schedule_slots_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_class_schedule_slots_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `club_class_types` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `club_class_schedule_slots_hall_id_fkey` FOREIGN KEY (`hall_id`) REFERENCES `club_halls` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `club_class_schedule_slots_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_subscription_type_classes` (
  `subscription_type_id` INT NOT NULL,
  `class_type_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_subscription_type_classes_class_type_id_idx` (`class_type_id`),
  PRIMARY KEY (`subscription_type_id`, `class_type_id`),
  CONSTRAINT `club_subscription_type_classes_subscription_type_id_fkey` FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `club_subscription_type_classes_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `club_class_types` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_classes`
  ADD COLUMN `class_type_id` INT NULL AFTER `id`,
  ADD COLUMN `template_slot_id` INT NULL AFTER `class_type_id`,
  ADD COLUMN `cancelled_reason` VARCHAR(255) NULL AFTER `audience`,
  ADD COLUMN `rescheduled_at` DATETIME(3) NULL AFTER `cancelled_reason`,
  ADD INDEX `club_classes_class_type_id_idx` (`class_type_id`),
  ADD INDEX `club_classes_template_slot_id_idx` (`template_slot_id`),
  ADD CONSTRAINT `club_classes_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `club_class_types` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_classes_template_slot_id_fkey` FOREIGN KEY (`template_slot_id`) REFERENCES `club_class_schedule_slots` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `club_class_enrollments`
  ADD COLUMN `booking_source` VARCHAR(30) NOT NULL DEFAULT 'reception' AFTER `attendance_time`,
  ADD COLUMN `subscription_id` INT NULL AFTER `booking_source`;
