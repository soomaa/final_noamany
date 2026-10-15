-- Additive sales CRM, target, and commission schema for one80/PHAROS.
-- No existing table is renamed or removed.

CREATE TABLE `club_sales_crm_leads` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `facebook_profile_url` VARCHAR(500) NULL,
  `interested_program` VARCHAR(80) NULL,
  `subscription_type_id` INTEGER NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'new',
  `assigned_to_id` INTEGER NULL,
  `assignment_mode` VARCHAR(20) NULL,
  `converted_member_id` INTEGER NULL,
  `invitation_id` INTEGER NULL,
  `notes` TEXT NULL,
  `last_contacted_at` DATETIME(3) NULL,
  `next_follow_up_at` DATETIME(3) NULL,
  `branch_id` INTEGER NOT NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `club_sales_crm_leads_status_idx` (`status`),
  INDEX `club_sales_crm_leads_assigned_to_id_idx` (`assigned_to_id`),
  INDEX `club_sales_crm_leads_branch_id_idx` (`branch_id`),
  INDEX `club_sales_crm_leads_phone_idx` (`phone`),
  INDEX `idx_club_sales_crm_leads_branch_phone` (`branch_id`, `phone`),
  INDEX `club_sales_crm_leads_source_idx` (`source`),
  INDEX `club_sales_crm_leads_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_crm_lead_follow_ups` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `note` TEXT NOT NULL,
  `status` VARCHAR(20) NULL,
  `activity_type` VARCHAR(20) NOT NULL DEFAULT 'note',
  `answered` BOOLEAN NULL,
  `interests` TEXT NULL,
  `next_follow_up_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `club_sales_crm_lead_follow_ups_lead_id_idx` (`lead_id`),
  INDEX `club_sales_crm_lead_follow_ups_activity_type_idx` (`activity_type`),
  INDEX `club_sales_crm_lead_follow_ups_created_at_idx` (`created_at`),
  CONSTRAINT `club_sales_crm_lead_follow_ups_lead_id_fkey`
    FOREIGN KEY (`lead_id`) REFERENCES `club_sales_crm_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_rep_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `monthly_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `commission_mode` VARCHAR(20) NOT NULL DEFAULT 'flat',
  `flat_commission_percent` DECIMAL(6, 3) NOT NULL DEFAULT 0,
  `target_period_mode` VARCHAR(20) NOT NULL DEFAULT 'monthly',
  `target_start_date` VARCHAR(10) NULL,
  `target_end_date` VARCHAR(10) NULL,
  `target_days` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `club_sales_rep_settings_employee_id_key` (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_commission_tiers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `settings_id` INTEGER NOT NULL,
  `min_achievement_pct` DECIMAL(6, 2) NOT NULL,
  `max_achievement_pct` DECIMAL(6, 2) NULL,
  `commission_percent` DECIMAL(6, 3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `club_sales_commission_tiers_settings_id_idx` (`settings_id`),
  CONSTRAINT `club_sales_commission_tiers_settings_id_fkey`
    FOREIGN KEY (`settings_id`) REFERENCES `club_sales_rep_settings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_trainer_commission_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `trainer_id` INTEGER NULL,
  `target_unit` VARCHAR(20) NOT NULL DEFAULT 'members',
  `base_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `target_period_mode` VARCHAR(20) NOT NULL DEFAULT 'monthly',
  `target_start_date` VARCHAR(10) NULL,
  `target_end_date` VARCHAR(10) NULL,
  `target_days` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `club_trainer_commission_settings_employee_id_key` (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_trainer_commission_tiers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `settings_id` INTEGER NOT NULL,
  `min_achievement_pct` DECIMAL(6, 2) NOT NULL,
  `max_achievement_pct` DECIMAL(6, 2) NULL,
  `commission_percent` DECIMAL(6, 3) NOT NULL,
  `label` VARCHAR(80) NULL,
  PRIMARY KEY (`id`),
  INDEX `club_trainer_commission_tiers_settings_id_idx` (`settings_id`),
  CONSTRAINT `club_trainer_commission_tiers_settings_id_fkey`
    FOREIGN KEY (`settings_id`) REFERENCES `club_trainer_commission_settings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_sales_round_robin_state` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `last_employee_id` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_target_settlements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `cycle_start` VARCHAR(10) NOT NULL,
  `cycle_end` VARCHAR(10) NOT NULL,
  `payroll_item_id` INTEGER NULL,
  `commission_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `settled_by` INTEGER NULL,
  `settled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_club_target_settlement_cycle` (`employee_id`, `target_type`, `cycle_start`, `cycle_end`),
  INDEX `club_target_settlements_payroll_item_id_idx` (`payroll_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add the quick-service lead toggle only when an older installation does not have it.
SET @creates_sales_lead_exists := (
  SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_quick_services'
    AND `COLUMN_NAME` = 'creates_sales_lead'
);
SET @creates_sales_lead_sql := IF(
  @creates_sales_lead_exists = 0,
  'ALTER TABLE `club_quick_services` ADD COLUMN `creates_sales_lead` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE creates_sales_lead_stmt FROM @creates_sales_lead_sql;
EXECUTE creates_sales_lead_stmt;
DEALLOCATE PREPARE creates_sales_lead_stmt;

-- Preserve one80 legacy leads by copying only compatible, active rows.
-- The legacy table is never updated, renamed, or deleted.
SET @legacy_leads_required_columns := (
  SELECT COUNT(DISTINCT `COLUMN_NAME`) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_leads'
    AND `COLUMN_NAME` IN ('name', 'phone', 'status', 'assigned_to', 'branch_id', 'notes', 'created_at', 'updated_at', 'is_deleted')
);
SET @legacy_leads_copy_sql := IF(
  @legacy_leads_required_columns = 9,
  'INSERT INTO `club_sales_crm_leads` (`full_name`, `phone`, `source`, `status`, `assigned_to_id`, `branch_id`, `notes`, `created_at`, `updated_at`) SELECT TRIM(src.`name`), TRIM(src.`phone`), ''walk_in'', CASE WHEN src.`status` IN (''new'', ''in_progress'', ''follow_later'', ''qualified'', ''converted'', ''lost'') THEN src.`status` ELSE ''new'' END, src.`assigned_to`, src.`branch_id`, src.`notes`, src.`created_at`, src.`updated_at` FROM `club_leads` src WHERE src.`is_deleted` = false AND src.`branch_id` IS NOT NULL AND src.`phone` IS NOT NULL AND TRIM(src.`phone`) <> '''' AND TRIM(src.`name`) <> '''' AND NOT EXISTS (SELECT 1 FROM `club_sales_crm_leads` dst WHERE dst.`branch_id` = src.`branch_id` AND dst.`phone` = TRIM(src.`phone`) AND dst.`full_name` = TRIM(src.`name`) AND dst.`created_at` = src.`created_at`)',
  'SELECT 1'
);
PREPARE legacy_leads_copy_stmt FROM @legacy_leads_copy_sql;
EXECUTE legacy_leads_copy_stmt;
DEALLOCATE PREPARE legacy_leads_copy_stmt;

-- Register the new RBAC resources during migration so fresh and existing servers do not
-- depend on an administrator opening the permission catalog before the routes can be granted.
INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`) VALUES
  ('sales.portal', NULL, 'page', 'بوابة أخصائي المبيعات', 'Sales Specialist Portal', '/sales-portal', 'UserRoundCheck', 0, true),
  ('club.sales-management', (SELECT club_parent.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club') club_parent), 'group', 'إدارة المبيعات', 'Sales Management', NULL, 'Handshake', 0, true)
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `type` = VALUES(`type`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `icon` = VALUES(`icon`), `is_active` = true;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`) VALUES
  ('club.leads', (SELECT sales_parent.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club.sales-management') sales_parent), 'page', 'العملاء المحتملون', 'Potential leads', '/club/leads', NULL, 0, true),
  ('club.sales.dashboard', (SELECT sales_parent.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club.sales-management') sales_parent), 'page', 'أداء فريق المبيعات', 'Sales performance', '/club/sales-dashboard', NULL, 1, true),
  ('club.sales.reports', (SELECT sales_parent.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club.sales-management') sales_parent), 'page', 'تقارير فريق المبيعات', 'Sales team reports', '/club/sales-reports', NULL, 2, true),
  ('club.sales.settings', (SELECT sales_parent.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club.sales-management') sales_parent), 'page', 'الأهداف والعمولات', 'Sales targets & commissions', '/club/sales-settings', NULL, 3, true)
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `type` = VALUES(`type`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = true;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource_row.`id`, action_row.`id`
FROM `rbac_resources` resource_row
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit')
WHERE resource_row.`key` IN ('sales.portal', 'club.leads');

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource_row.`id`, action_row.`id`
FROM `rbac_resources` resource_row
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'update', 'export', 'print')
WHERE resource_row.`key` = 'club.sales.dashboard';

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource_row.`id`, action_row.`id`
FROM `rbac_resources` resource_row
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'export', 'print')
WHERE resource_row.`key` = 'club.sales.reports';

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource_row.`id`, action_row.`id`
FROM `rbac_resources` resource_row
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'update', 'configure', 'audit')
WHERE resource_row.`key` = 'club.sales.settings';

INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT role_row.`id`, resource_row.`id`, action_row.`id`, 'allow'
FROM `department_jobs` job_row
JOIN `rbac_roles` role_row ON role_row.`key` = CONCAT('job_title_', job_row.`id`)
JOIN `rbac_resources` resource_row ON resource_row.`key` = 'sales.portal'
JOIN `rbac_actions` action_row ON action_row.`key` IN ('view', 'update')
WHERE (
  job_row.`name` LIKE '%مبيعات%'
  OR job_row.`name` LIKE '%تسويق%'
  OR job_row.`name` LIKE '%سيلز%'
  OR LOWER(TRIM(job_row.`name`)) IN ('sales', 'sales specialist', 'sales representative')
)
AND job_row.`name` NOT LIKE '%مدير%'
AND job_row.`name` NOT LIKE '%رئيس%'
AND job_row.`name` NOT LIKE '%مشرف%'
AND LOWER(job_row.`name`) NOT LIKE '%manager%'
AND LOWER(job_row.`name`) NOT LIKE '%head%'
AND LOWER(job_row.`name`) NOT LIKE '%supervisor%';
