-- Staff contact history for subscriptions (renewal / expiry follow-up calls), ported from PHAROS
-- 20260912120000_subscription_follow_ups. Append-only; financial and renewal records stay untouched.
CREATE TABLE IF NOT EXISTS `club_subscription_follow_ups` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subscription_id` INTEGER NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `note` VARCHAR(2000) NULL,
  `next_contact_on` VARCHAR(10) NULL,
  `created_by` INTEGER NOT NULL,
  `created_by_name` VARCHAR(200) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `club_subscription_follow_ups_subscription_id_created_at_idx` (`subscription_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_subscription_follow_ups_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
