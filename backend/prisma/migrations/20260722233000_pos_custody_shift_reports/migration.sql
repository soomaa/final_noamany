-- Connect every custody return to its original issue and add the dedicated cafe-management job title.
-- Data preserving: legacy returns stay unlinked and remain visible in the audit log.

ALTER TABLE `sales_cash_drawer_transactions`
  ADD COLUMN `source_transaction_id` INTEGER NULL,
  ADD INDEX `sales_cash_drawer_transactions_source_transaction_id_idx` (`source_transaction_id`);

INSERT INTO `department_jobs` (`name`, `from_id_fk`, `status`, `in_order`, `dep_code`, `edara_id`, `is_trainer`)
SELECT 'إدارة الكافيه', 0, 1, '999', 980, NULL, FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM `department_jobs` WHERE TRIM(`name`) = 'إدارة الكافيه'
);

INSERT INTO `rbac_roles` (`key`, `name_ar`, `name_en`, `description`, `is_system`, `is_super_admin`, `created_at`, `updated_at`)
SELECT CONCAT('job_title_', job.`id`), 'إدارة الكافيه', 'Cafe Management',
       'صلاحيات المسمى الوظيفي: إدارة الكافيه', TRUE, FALSE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `department_jobs` job
WHERE TRIM(job.`name`) = 'إدارة الكافيه'
ON DUPLICATE KEY UPDATE
  `name_ar` = VALUES(`name_ar`),
  `name_en` = VALUES(`name_en`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3);

-- A staff member assigned this title can operate the current cafe, POS, inventory and
-- purchasing screens immediately. The normal permission matrix can still revoke any cell.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT role.`id`, resource_action.`resource_id`, resource_action.`action_id`, 'allow'
FROM `rbac_roles` role
CROSS JOIN `rbac_resource_actions` resource_action
JOIN `rbac_resources` resource ON resource.`id` = resource_action.`resource_id`
WHERE role.`key` = CONCAT('job_title_', (
  SELECT job.`id` FROM `department_jobs` job WHERE TRIM(job.`name`) = 'إدارة الكافيه' ORDER BY job.`id` LIMIT 1
))
AND (resource.`key` LIKE 'gym-sales%' OR resource.`key` LIKE 'club.cafe%');
