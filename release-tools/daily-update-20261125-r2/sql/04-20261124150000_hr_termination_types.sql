-- Structured employee exit records (termination types). Accessed with raw SQL only:
-- production never runs `prisma generate`, so this table is not in the Prisma Client.
CREATE TABLE IF NOT EXISTS `hr_employee_exits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `emp_id` INTEGER NOT NULL,
  -- resignation | resignation_short_notice | abandonment | termination | contract_end | other
  `exit_type` VARCHAR(32) NOT NULL,
  `notice_given_date` CHAR(10) NULL,
  `last_working_date` CHAR(10) NOT NULL,
  `required_notice_days` INTEGER NOT NULL DEFAULT 30,
  `notice_days_given` INTEGER NULL,
  `notice_shortfall_days` INTEGER NOT NULL DEFAULT 0,
  `reason` VARCHAR(500) NULL,
  `notes` TEXT NULL,
  `settlement_notes` TEXT NULL,
  `recorded_by` INTEGER NULL,
  `recorded_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `idx_hr_employee_exits_emp`(`emp_id`),
  INDEX `idx_hr_employee_exits_type`(`exit_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
