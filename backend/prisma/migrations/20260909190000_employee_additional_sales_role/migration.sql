-- A staff member may keep their primary job title while also working as a personal sales specialist.
SET @employee_is_sales_exists := (
  SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'employees'
    AND `COLUMN_NAME` = 'is_sales'
);
SET @employee_is_sales_sql := IF(
  @employee_is_sales_exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `is_sales` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE employee_is_sales_stmt FROM @employee_is_sales_sql;
EXECUTE employee_is_sales_stmt;
DEALLOCATE PREPARE employee_is_sales_stmt;

INSERT INTO `rbac_roles`
  (`key`, `name_ar`, `name_en`, `description`, `is_system`, `is_super_admin`, `created_at`, `updated_at`)
VALUES
  ('additional_sales', 'مسؤولية مبيعات إضافية', 'Additional Sales Responsibility', 'بوابة المبيعات الشخصية بجانب صلاحيات المسمى الوظيفي الأساسي', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name_ar` = VALUES(`name_ar`),
  `name_en` = VALUES(`name_en`),
  `description` = VALUES(`description`),
  `is_system` = true;

INSERT INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT role_row.`id`, resource_row.`id`, action_row.`id`, 'allow'
FROM `rbac_roles` role_row
JOIN `rbac_resources` resource_row ON resource_row.`key` = 'sales.portal'
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'update')
WHERE role_row.`key` = 'additional_sales'
ON DUPLICATE KEY UPDATE `effect` = VALUES(`effect`);
