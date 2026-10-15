ALTER TABLE `club_class_types`
 ADD COLUMN `allow_external` BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN `linked_subscription_type_ids` JSON NULL,
 ADD COLUMN `commission_percentage` DECIMAL(6,3) NULL;
ALTER TABLE `club_classes`
 ADD COLUMN `allow_external` BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN `linked_subscription_type_ids` JSON NULL;
ALTER TABLE `club_class_enrollments`
 ADD COLUMN `package_value_snapshot` DECIMAL(14,4) NULL,
 ADD COLUMN `package_sessions_snapshot` INT NULL;
CREATE TABLE `club_class_guest_attendance` (
 `id` INT NOT NULL AUTO_INCREMENT, `class_id` INT NOT NULL,
 `name` VARCHAR(200) NOT NULL, `phone` VARCHAR(30) NOT NULL, `gender` VARCHAR(10) NOT NULL,
 `amount` DECIMAL(14,4) NOT NULL, `commission_percentage` DECIMAL(6,3) NOT NULL,
 `receipt_id` INT NOT NULL, `created_by` INT NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE KEY `uq_class_guest_phone` (`class_id`,`phone`), UNIQUE KEY `uq_class_guest_receipt` (`receipt_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
