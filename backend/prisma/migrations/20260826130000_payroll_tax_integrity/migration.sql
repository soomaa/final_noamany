CREATE TABLE `payroll_tax_policies` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(60) NOT NULL,
  `version` INTEGER NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `jurisdiction` VARCHAR(80) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `annual_allowance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
  `annual_tax_credit` DECIMAL(19, 2) NOT NULL DEFAULT 0,
  `periods_per_year` INTEGER NOT NULL DEFAULT 12,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `source_reference` VARCHAR(500) NULL,
  `created_by` INTEGER NULL,
  `published_by` INTEGER NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_payroll_tax_policy_code_version` (`code`, `version`),
  INDEX `idx_payroll_tax_policy_effective_status` (`effective_from`, `effective_to`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payroll_tax_brackets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `policy_id` INTEGER NOT NULL,
  `sort_order` INTEGER NOT NULL,
  `lower_bound` DECIMAL(19, 2) NOT NULL,
  `upper_bound` DECIMAL(19, 2) NULL,
  `rate_percent` DECIMAL(7, 4) NOT NULL,
  UNIQUE INDEX `uq_payroll_tax_bracket_order` (`policy_id`, `sort_order`),
  INDEX `idx_payroll_tax_bracket_policy` (`policy_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_payroll_tax_bracket_policy`
    FOREIGN KEY (`policy_id`) REFERENCES `payroll_tax_policies` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_mosayer`
  ADD COLUMN `tax_policy_id` INTEGER NULL,
  ADD COLUMN `tax_policy_version` VARCHAR(80) NULL,
  ADD COLUMN `tax_policy_snapshot` JSON NULL,
  ADD COLUMN `egmali_income_tax` DECIMAL(19, 2) NULL,
  ADD UNIQUE INDEX `uq_hr_mosayer_period` (`mosayer_year`, `mosayer_month`);

ALTER TABLE `hr_mosayer_details`
  ADD COLUMN `taxable_earnings` DECIMAL(19, 2) NULL,
  ADD COLUMN `income_tax` DECIMAL(19, 2) NULL,
  ADD COLUMN `tax_policy_id` INTEGER NULL,
  ADD COLUMN `tax_policy_version` VARCHAR(80) NULL,
  ADD COLUMN `tax_breakdown` JSON NULL;
