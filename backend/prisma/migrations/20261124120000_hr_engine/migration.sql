-- HR engine (24 Nov): per-weekday shift times, punch-confirmed overtime, compensatory days.
-- Hand-written for MySQL 8; safe to run twice. Production never runs `prisma generate`,
-- so the application reads/writes everything below with raw SQL.

-- 1) Per-weekday shift times. weekday follows JavaScript getDay(): 0=Sunday ... 5=Friday, 6=Saturday.
--    A row replaces all six times of the shift on that weekday (e.g. Friday opens at 10:00).
CREATE TABLE IF NOT EXISTS `tbl_hdodr_setting_day_overrides` (
  `shift_id` INTEGER NOT NULL,
  `weekday` TINYINT NOT NULL,
  `hdoor_from_time` VARCHAR(10) NOT NULL,
  `hdoor_to_time` VARCHAR(10) NOT NULL,
  `hdoor_khasm_from` VARCHAR(10) NOT NULL,
  `ensraf_from_time` VARCHAR(10) NOT NULL,
  `ensraf_to_time` VARCHAR(10) NOT NULL,
  `ensraf_khasm_from` VARCHAR(10) NOT NULL,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`shift_id`, `weekday`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) Manager-entered overtime: keep what the manager asked for next to what the punches confirm.
--    num_hours (read by payroll) now holds the confirmed whole hours.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_emps_hours_edafi' AND COLUMN_NAME = 'requested_hours');
SET @sql := IF(@col = 0, 'ALTER TABLE `tbl_emps_hours_edafi` ADD COLUMN `requested_hours` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_emps_hours_edafi' AND COLUMN_NAME = 'confirmed_minutes');
SET @sql := IF(@col = 0, 'ALTER TABLE `tbl_emps_hours_edafi` ADD COLUMN `confirmed_minutes` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Compensatory days earned by working (check-in + check-out) on the weekly day off.
CREATE TABLE IF NOT EXISTS `hr_comp_day_credits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `emp_code` INTEGER NOT NULL,
  `work_date` CHAR(10) NOT NULL,
  `minutes` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(10) NOT NULL DEFAULT 'earned',
  `used_leave_id` INTEGER NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_comp_day_emp_date` (`emp_code`, `work_date`),
  INDEX `idx_comp_day_status` (`emp_code`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
