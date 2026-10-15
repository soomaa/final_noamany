-- Fitness class target audience (men / women / kids / mixed) for the member app class listing.
-- club_classes is empty in the seed, so a NOT NULL column with a default is safe (no backfill needed).
ALTER TABLE `club_classes`
  ADD COLUMN `audience` ENUM('men', 'women', 'kids', 'mixed') NOT NULL DEFAULT 'mixed' AFTER `status`;

-- Member-facing app notifications (one row per recipient; broadcasts fanned out on create).
CREATE TABLE IF NOT EXISTS `am_member_notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `member_id` INT NOT NULL,
  `branch_id` INT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `type` VARCHAR(40) NOT NULL DEFAULT 'general',
  `data` TEXT NULL,
  `image_url` VARCHAR(500) NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT false,
  `read_at` DATETIME(3) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `am_member_notifications_member_id_idx` (`member_id`),
  INDEX `am_member_notifications_member_id_is_read_idx` (`member_id`, `is_read`),
  INDEX `am_member_notifications_branch_id_idx` (`branch_id`),
  INDEX `am_member_notifications_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
