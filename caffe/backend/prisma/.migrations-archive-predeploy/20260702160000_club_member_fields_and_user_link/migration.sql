-- Add member profile fields and user link columns (idempotent)

ALTER TABLE `club_members`
  ADD COLUMN `marital_status` VARCHAR(20) NULL,
  ADD COLUMN `job_title` VARCHAR(120) NULL;

ALTER TABLE `users`
  ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `club_members_app_user_id_idx` ON `club_members`(`app_user_id`);
