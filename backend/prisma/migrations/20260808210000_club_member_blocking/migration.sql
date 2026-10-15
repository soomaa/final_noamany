ALTER TABLE `club_members`
  ADD COLUMN `is_blocked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `block_reason` VARCHAR(500) NULL,
  ADD COLUMN `blocked_at` DATETIME(3) NULL,
  ADD COLUMN `blocked_by` INTEGER NULL;

CREATE INDEX `club_members_is_blocked_idx` ON `club_members`(`is_blocked`);
