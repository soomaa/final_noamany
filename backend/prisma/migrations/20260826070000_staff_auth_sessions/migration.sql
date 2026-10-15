CREATE TABLE IF NOT EXISTS `staff_auth_sessions` (
  `id` CHAR(36) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `user_id` INTEGER NOT NULL,
  `refresh_token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `revocation_reason` VARCHAR(100) NULL,
  `replaced_by` CHAR(36) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NULL,

  UNIQUE INDEX `staff_auth_sessions_refresh_token_hash_key` (`refresh_token_hash`),
  INDEX `staff_auth_sessions_user_id_revoked_at_expires_at_idx` (`user_id`, `revoked_at`, `expires_at`),
  INDEX `staff_auth_sessions_family_id_revoked_at_idx` (`family_id`, `revoked_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
