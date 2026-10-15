-- Manual POS shift handover, drawer movements and employee/partner statements.
-- Data-preserving: existing sessions become sequence 1 and existing sales keep their current behavior.

ALTER TABLE `sales_shifts`
  ADD COLUMN `responsible_user_id` INTEGER NULL,
  ADD INDEX `sales_shifts_responsible_user_id_idx` (`responsible_user_id`);

ALTER TABLE `sales_shift_sessions`
  DROP INDEX `uq_open_session`,
  ADD COLUMN `session_sequence` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `handover_from_session_id` INTEGER NULL,
  ADD COLUMN `transferred_in` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `cash_drop_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `retained_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX `uq_shift_session_sequence` (`session_date`, `shift_id`, `branch_id`, `session_sequence`),
  ADD INDEX `sales_shift_sessions_handover_from_session_id_idx` (`handover_from_session_id`);

ALTER TABLE `sales_quick_sales`
  ADD COLUMN `billing_cycle` VARCHAR(20) NULL,
  ADD COLUMN `billing_status` VARCHAR(20) NOT NULL DEFAULT 'not_applicable',
  ADD INDEX `sales_quick_sales_sale_type_billing_status_idx` (`sale_type`, `billing_status`);

CREATE TABLE `sales_cash_drawer_transactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(50) NOT NULL,
  `branch_id` INTEGER NULL,
  `shift_session_id` INTEGER NOT NULL,
  `counterparty_session_id` INTEGER NULL,
  `movement_type` VARCHAR(30) NOT NULL,
  `direction` VARCHAR(10) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `category` VARCHAR(50) NULL,
  `description` TEXT NULL,
  `employee_id` INTEGER NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'posted',
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `sales_cash_drawer_transactions_reference_key` (`reference`),
  INDEX `sales_cash_drawer_transactions_shift_session_id_created_at_idx` (`shift_session_id`, `created_at`),
  INDEX `sales_cash_drawer_transactions_branch_id_created_at_idx` (`branch_id`, `created_at`),
  INDEX `sales_cash_drawer_transactions_movement_type_idx` (`movement_type`),
  INDEX `sales_cash_drawer_transactions_employee_id_idx` (`employee_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_cash_drawer_transactions_shift_session_id_fkey`
    FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sales_billing_statements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `statement_number` VARCHAR(50) NOT NULL,
  `account_type` VARCHAR(20) NOT NULL,
  `employee_id` INTEGER NULL,
  `partner_id` INTEGER NULL,
  `billing_cycle` VARCHAR(20) NOT NULL,
  `period_start` VARCHAR(10) NOT NULL,
  `period_end` VARCHAR(10) NOT NULL,
  `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `settlement_method` VARCHAR(30) NULL,
  `payment_method` ENUM('cash','card','wallet','transfer','mixed') NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'issued',
  `notes` TEXT NULL,
  `branch_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `settled_by` INTEGER NULL,
  `settled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sales_billing_statements_statement_number_key` (`statement_number`),
  INDEX `sales_billing_statements_account_type_employee_id_partner_id_idx` (`account_type`, `employee_id`, `partner_id`),
  INDEX `sales_billing_statements_period_start_period_end_idx` (`period_start`, `period_end`),
  INDEX `sales_billing_statements_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sales_billing_statement_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `statement_id` INTEGER NOT NULL,
  `quick_sale_id` INTEGER NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `sales_billing_statement_items_quick_sale_id_key` (`quick_sale_id`),
  INDEX `sales_billing_statement_items_statement_id_idx` (`statement_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_billing_statement_items_statement_id_fkey`
    FOREIGN KEY (`statement_id`) REFERENCES `sales_billing_statements` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `sales_billing_statement_items_quick_sale_id_fkey`
    FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Employee/partner invoices already present before this release remain explicitly excluded
-- from new billing runs until an operator chooses a new daily/monthly billing mode.

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT pages.page_key, parent.`id`, 'page', pages.name_ar, pages.name_en, pages.route, NULL, pages.sort_order, TRUE
FROM (
  SELECT 'gym-sales.sales.shifts' page_key, 'الورديات' name_ar, 'Shifts' name_en, '/sales/shifts' route, 3 sort_order
  UNION ALL SELECT 'gym-sales.sales.treasury', 'الخزينة والدرج', 'Cash drawer', '/sales/treasury', 4
  UNION ALL SELECT 'gym-sales.sales.settlements', 'تسويات الموظفين والشركاء', 'Employee & partner settlements', '/sales/settlements', 5
) pages
JOIN `rbac_resources` parent ON parent.`key` = 'gym-sales.sales'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `sort_order` = VALUES(`sort_order`), `is_active` = TRUE;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN ('gym-sales.sales.shifts', 'gym-sales.sales.treasury', 'gym-sales.sales.settlements')
  AND action.`key` IN ('view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print', 'audit', 'configure');

-- Existing cafe cashiers retain equivalent access after deployment. Future changes remain
-- independently revocable per screen through the normal role matrix.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT old_permission.`role_id`, new_resource.`id`, old_permission.`action_id`, old_permission.`effect`
FROM `rbac_role_permissions` old_permission
JOIN `rbac_resources` old_resource ON old_resource.`id` = old_permission.`resource_id` AND old_resource.`key` = 'gym-sales.sales.new_receipt'
JOIN `rbac_resources` new_resource ON new_resource.`key` IN ('gym-sales.sales.shifts', 'gym-sales.sales.treasury', 'gym-sales.sales.settlements')
JOIN `rbac_resource_actions` allowed ON allowed.`resource_id` = new_resource.`id` AND allowed.`action_id` = old_permission.`action_id`;

INSERT IGNORE INTO `rbac_user_exceptions` (`user_id`, `resource_id`, `action_id`, `effect`, `expires_at`, `reason`, `created_by`)
SELECT old_exception.`user_id`, new_resource.`id`, old_exception.`action_id`, old_exception.`effect`, old_exception.`expires_at`, old_exception.`reason`, old_exception.`created_by`
FROM `rbac_user_exceptions` old_exception
JOIN `rbac_resources` old_resource ON old_resource.`id` = old_exception.`resource_id` AND old_resource.`key` = 'gym-sales.sales.new_receipt'
JOIN `rbac_resources` new_resource ON new_resource.`key` IN ('gym-sales.sales.shifts', 'gym-sales.sales.treasury', 'gym-sales.sales.settlements')
JOIN `rbac_resource_actions` allowed ON allowed.`resource_id` = new_resource.`id` AND allowed.`action_id` = old_exception.`action_id`;
