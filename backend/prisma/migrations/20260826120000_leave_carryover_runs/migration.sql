CREATE TABLE IF NOT EXISTS `leave_carryover_runs` (
  `target_year` INTEGER NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `processed` INTEGER NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `initiated_by` INTEGER NULL,
  PRIMARY KEY (`target_year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
