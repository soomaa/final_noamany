-- InBody settings on «قياسات الأعضاء»: single price + packages per branch, sales policy, member balances.

ALTER TABLE `club_inbody_services`
  ADD COLUMN `measurement_count` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `validity_days` INTEGER NULL;
CREATE INDEX `club_inbody_services_branch_id_idx` ON `club_inbody_services` (`branch_id`);

ALTER TABLE `club_inbody_measurements`
  ADD COLUMN `settlement_source` VARCHAR(30) NOT NULL DEFAULT 'legacy',
  ADD COLUMN `branch_id` INTEGER NULL,
  ADD COLUMN `subscription_id` INTEGER NULL,
  ADD COLUMN `entitlement_id` INTEGER NULL,
  ADD COLUMN `invoice_id` INTEGER NULL,
  ADD COLUMN `created_by` INTEGER NULL;
CREATE INDEX `club_inbody_measurements_entitlement_id_idx` ON `club_inbody_measurements` (`entitlement_id`);
CREATE INDEX `club_inbody_measurements_invoice_id_idx` ON `club_inbody_measurements` (`invoice_id`);

CREATE TABLE `club_inbody_branch_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `allow_without_active_membership` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `club_inbody_branch_settings_branch_id_key` (`branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_inbody_entitlements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `member_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `invoice_id` INTEGER NOT NULL,
  `total_count` INTEGER NOT NULL,
  `used_count` INTEGER NOT NULL DEFAULT 0,
  `purchased_date` VARCHAR(10) NOT NULL,
  `expires_at` VARCHAR(10) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `club_inbody_entitlements_invoice_id_key` (`invoice_id`),
  INDEX `club_inbody_entitlements_member_id_expires_at_idx` (`member_id`, `expires_at`),
  INDEX `club_inbody_entitlements_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
