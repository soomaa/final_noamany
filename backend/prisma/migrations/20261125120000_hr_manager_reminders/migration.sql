-- «الحالات اليومية» reminders: one row per (kind, user, day) so a branch manager does not get the same
-- open-case count twice on one day (kind = 'manager') and HR gets one escalation a day (kind = 'hr').
-- Hand-written: production never runs `prisma generate`; the code reads/writes this table with raw SQL
-- (and creates it on first use if this migration was not applied).
CREATE TABLE IF NOT EXISTS `hr_attendance_exception_reminders` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `kind` VARCHAR(20) NOT NULL,
  `user_id` INTEGER NOT NULL,
  `ref_date` CHAR(10) NOT NULL,
  `open_count` INTEGER NOT NULL DEFAULT 0,
  `sent_count` INTEGER NOT NULL DEFAULT 1,
  `first_sent_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `last_sent_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_attendance_reminder_kind_user_date`(`kind`, `user_id`, `ref_date`),
  INDEX `idx_attendance_reminder_date`(`ref_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
