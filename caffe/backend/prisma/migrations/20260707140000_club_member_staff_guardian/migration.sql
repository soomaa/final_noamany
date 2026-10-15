ALTER TABLE `club_members`
  ADD COLUMN `sales_id` INT NULL AFTER `is_active`,
  ADD COLUMN `employee_id` INT NULL AFTER `sales_id`,
  ADD COLUMN `guardian_name` VARCHAR(200) NULL AFTER `employee_id`,
  ADD COLUMN `guardian_phone` VARCHAR(20) NULL AFTER `guardian_name`;
