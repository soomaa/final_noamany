-- Register every Cafe/POS page that appears in the React sidebar. Without these
-- resource rows a leaf page could not be granted/revoked independently.
INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.cafe.reports', parent.`id`, 'page', 'تقارير الكافيه', 'Cafe reports', '/club/cafe/reports', NULL, 30, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.cafe'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'gym-sales.inventory.raw_materials', parent.`id`, 'page', 'إدارة الخامات', 'Raw materials', '/club/cafe/raw-materials', NULL, 15, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.inventory'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'gym-sales.procurement.suppliers', parent.`id`, 'page', 'موردو الكافيه', 'Cafe suppliers', '/club/cafe/suppliers', NULL, 1, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.procurement'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'gym-sales.procurement.cafe_purchases', parent.`id`, 'page', 'مشتريات الكافيه', 'Cafe purchases', '/club/cafe/purchases', NULL, 2, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.procurement'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'gym-sales.procurement.supplier_payments', parent.`id`, 'page', 'سداد مديونية الموردين', 'Supplier payments', '/club/cafe/supplier-payments', NULL, 3, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.procurement'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'gym-sales.sales.drafts', parent.`id`, 'page', 'فواتير اليوم', 'Today''s invoices', '/sales/drafts', NULL, 2, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.sales'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

-- Report pages expose View / Export / Print.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'club.cafe.reports'
  AND action.`key` IN ('view', 'export', 'print');

-- Operational pages expose the standard approval matrix.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN (
  'gym-sales.inventory.raw_materials',
  'gym-sales.procurement.suppliers',
  'gym-sales.procurement.cafe_purchases',
  'gym-sales.procurement.supplier_payments'
)
  AND action.`key` IN ('view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print', 'audit');

-- Daily invoices use the normal list-page actions.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'gym-sales.sales.drafts'
  AND action.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit');
