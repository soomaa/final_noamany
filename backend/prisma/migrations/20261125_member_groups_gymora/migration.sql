-- Member groups (Gymora port): branch, default discount, per-package rules, employee number,
-- and an immutable group-discount snapshot on every subscription. Additive only.

ALTER TABLE `club_member_groups`
  ADD COLUMN `branch_id` INTEGER NULL,
  ADD COLUMN `discount_type` VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE INDEX `club_member_groups_branch_id_is_active_idx` ON `club_member_groups` (`branch_id`, `is_active`);

ALTER TABLE `club_member_group_members`
  ADD COLUMN `employee_number` VARCHAR(50) NULL;

CREATE TABLE `club_member_group_plans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `group_id` INTEGER NOT NULL,
  `subscription_type_id` INTEGER NOT NULL,
  `discount_type` VARCHAR(20) NOT NULL DEFAULT 'percentage',
  `discount_value` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `club_member_group_plans_group_id_subscription_type_id_key` (`group_id`, `subscription_type_id`),
  INDEX `club_member_group_plans_subscription_type_id_idx` (`subscription_type_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_member_group_plans`
  ADD CONSTRAINT `club_member_group_plans_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `club_member_groups`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_member_group_plans_subscription_type_id_fkey` FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `discount_group_id` INTEGER NULL,
  ADD COLUMN `discount_group_name` VARCHAR(200) NULL,
  ADD COLUMN `group_discount_type` VARCHAR(20) NULL,
  ADD COLUMN `group_discount_rate` DECIMAL(10,2) NULL,
  ADD COLUMN `group_discount_value` DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE INDEX `club_subscriptions_discount_group_id_registration_date_idx` ON `club_subscriptions` (`discount_group_id`, `registration_date`);
ALTER TABLE `club_subscriptions`
  ADD CONSTRAINT `club_subscriptions_discount_group_id_fkey` FOREIGN KEY (`discount_group_id`) REFERENCES `club_member_groups`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
