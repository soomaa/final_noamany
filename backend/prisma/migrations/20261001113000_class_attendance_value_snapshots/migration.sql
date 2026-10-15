ALTER TABLE `club_classes` ADD COLUMN `commission_percentage` DECIMAL(6,3) NULL;
ALTER TABLE `club_class_enrollments`
  ADD COLUMN `session_value_snapshot` DECIMAL(14,4) NULL,
  ADD COLUMN `commission_percentage_snapshot` DECIMAL(6,3) NULL;
