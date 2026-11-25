-- Member app push: FCM device tokens of «أنا نعماني». One row per token; token_hash = sha256(token)
-- is the unique key (FCM tokens can exceed an indexable VARCHAR). invalid_at marks tokens FCM rejected.
CREATE TABLE IF NOT EXISTS `club_member_device_tokens` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `member_id` INTEGER NOT NULL,
  `token` TEXT NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `platform` VARCHAR(10) NOT NULL,
  `app_version` VARCHAR(40) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `invalid_at` DATETIME(3) NULL,

  UNIQUE INDEX `uq_club_member_device_tokens_hash`(`token_hash`),
  INDEX `club_member_device_tokens_member_id_idx`(`member_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
