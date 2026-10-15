ALTER TABLE `club_gym_policies` ADD COLUMN `outstanding_grace_days` INTEGER NOT NULL DEFAULT 7;
CREATE TABLE `club_entry_alerts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `member_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `severity` VARCHAR(10) NOT NULL,
  `message` TEXT NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_entry_alerts_branch_id_created_at_idx` (`branch_id`, `created_at`),
  INDEX `club_entry_alerts_member_id_branch_id_created_at_idx` (`member_id`, `branch_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
