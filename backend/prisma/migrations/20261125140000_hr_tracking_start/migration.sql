-- «بداية متابعة الحالات»: daily-exception cases before this date are never listed, counted in the
-- banner, reminded or escalated. Set to the go-live day so old history does not flood managers / HR.
-- INSERT IGNORE: an owner-chosen value (or a re-run) is never overwritten. Value is JSON ("YYYY-MM-DD").
-- Hand-written and idempotent (raw-SQL table, see 20261125100000_hr_payroll_settings).
CREATE TABLE IF NOT EXISTS `hr_payroll_settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` TEXT NULL,
  `updated_by` INTEGER NULL,
  `updated_by_name` VARCHAR(150) NULL,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `hr_payroll_settings` (`setting_key`, `setting_value`, `updated_by`, `updated_by_name`)
VALUES ('exceptionsTrackingStartDate', CONCAT('"', DATE_FORMAT(CURDATE(), '%Y-%m-%d'), '"'), NULL, 'تشغيل النظام');
