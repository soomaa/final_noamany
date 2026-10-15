ALTER TABLE `club_sales_rep_settings`
  ADD COLUMN `use_defaults` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `club_sales_commission_tiers`
  ADD COLUMN `label` VARCHAR(80) NULL;

CREATE TABLE `club_sales_default_settings` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `monthly_target` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `commission_mode` VARCHAR(20) NOT NULL DEFAULT 'flat',
  `flat_commission_percent` DECIMAL(6,3) NOT NULL DEFAULT 0,
  `target_period_mode` VARCHAR(20) NOT NULL DEFAULT 'monthly',
  `target_start_date` VARCHAR(10) NULL,
  `target_end_date` VARCHAR(10) NULL,
  `target_days` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_default_commission_tiers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `settings_id` INTEGER NOT NULL,
  `min_achievement_pct` DECIMAL(6,2) NOT NULL,
  `max_achievement_pct` DECIMAL(6,2) NULL,
  `commission_percent` DECIMAL(6,3) NOT NULL,
  `label` VARCHAR(80) NULL,
  INDEX `club_sales_default_commission_tiers_settings_id_idx` (`settings_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_sales_default_commission_tiers_settings_id_fkey`
    FOREIGN KEY (`settings_id`) REFERENCES `club_sales_default_settings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_rep_branches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  INDEX `club_sales_rep_branches_branch_id_idx` (`branch_id`),
  UNIQUE INDEX `club_sales_rep_branches_employee_id_branch_id_key` (`employee_id`, `branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `club_sales_rep_branches` (`employee_id`, `branch_id`)
SELECT `club_sales_rep_settings`.`employee_id`, `employees`.`branch_id_fk`
FROM `club_sales_rep_settings`
JOIN `employees` ON `employees`.`id` = `club_sales_rep_settings`.`employee_id`
WHERE `employees`.`branch_id_fk` IS NOT NULL
ON DUPLICATE KEY UPDATE `branch_id` = VALUES(`branch_id`);
