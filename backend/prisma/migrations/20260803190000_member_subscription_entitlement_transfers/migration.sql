ALTER TABLE `club_subscriptions`
  ADD COLUMN `transferred_credit_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `waived_amount`,
  ADD COLUMN `transferred_out_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `transferred_credit_amount`;

CREATE TABLE `club_member_subscription_transfers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `source_subscription_id` INT NOT NULL,
  `destination_subscription_id` INT NOT NULL,
  `source_member_id` INT NOT NULL,
  `destination_member_id` INT NOT NULL,
  `source_branch_id` INT NOT NULL,
  `destination_branch_id` INT NOT NULL,
  `entitlement_kind` VARCHAR(20) NOT NULL,
  `remaining_days` INT NULL,
  `remaining_sessions` INT NULL,
  `transferred_value` DECIMAL(10,2) NOT NULL,
  `effective_date` VARCHAR(10) NOT NULL,
  `reason` TEXT NOT NULL,
  `created_by` INT NOT NULL,
  `before_json` JSON NOT NULL,
  `after_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_member_transfer_source_sub` (`source_subscription_id`),
  UNIQUE INDEX `uq_member_transfer_destination_sub` (`destination_subscription_id`),
  INDEX `idx_member_transfer_source_member` (`source_member_id`, `created_at`),
  INDEX `idx_member_transfer_destination_member` (`destination_member_id`, `created_at`),
  INDEX `idx_member_transfer_source_branch` (`source_branch_id`, `created_at`),
  INDEX `idx_member_transfer_destination_branch` (`destination_branch_id`, `created_at`),
  CONSTRAINT `fk_member_transfer_source_sub` FOREIGN KEY (`source_subscription_id`) REFERENCES `club_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_member_transfer_destination_sub` FOREIGN KEY (`destination_subscription_id`) REFERENCES `club_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_member_transfer_source_member` FOREIGN KEY (`source_member_id`) REFERENCES `club_members` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_member_transfer_destination_member` FOREIGN KEY (`destination_member_id`) REFERENCES `club_members` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
