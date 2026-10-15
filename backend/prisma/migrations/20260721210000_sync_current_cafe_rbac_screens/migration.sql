-- Keep the Cafe & Inventory permission matrix identical to the current React sidebar.
-- Every visible page owns an independent resource so a page-level Deny revokes both
-- navigation and API access without being bypassed by a broad group permission.

UPDATE `rbac_resources`
SET `name_ar` = 'إدارة الكافيه والمخزون', `name_en` = 'Cafe & Inventory', `is_active` = TRUE
WHERE `key` = 'gym-sales';

UPDATE `rbac_resources` parent
SET `parent_id` = (SELECT module.`id` FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'gym-sales') module),
    `name_ar` = CASE parent.`key`
      WHEN 'gym-sales.sales' THEN 'إدارة البيع'
      WHEN 'gym-sales.cafe' THEN 'الكافيه'
      WHEN 'gym-sales.inventory' THEN 'إدارة الخامات والمخزون'
      WHEN 'gym-sales.procurement' THEN 'إدارة المشتريات'
    END,
    `sort_order` = CASE parent.`key`
      WHEN 'gym-sales.sales' THEN 1
      WHEN 'gym-sales.cafe' THEN 2
      WHEN 'gym-sales.inventory' THEN 3
      WHEN 'gym-sales.procurement' THEN 4
    END,
    `is_active` = TRUE
WHERE parent.`key` IN ('gym-sales.sales', 'gym-sales.cafe', 'gym-sales.inventory', 'gym-sales.procurement');

-- Sales screens.
UPDATE `rbac_resources` resource
JOIN `rbac_resources` parent ON parent.`key` = 'gym-sales.sales'
SET resource.`parent_id` = parent.`id`,
    resource.`name_ar` = CASE resource.`key`
      WHEN 'gym-sales.sales.new_receipt' THEN 'إيصال بيع جديد'
      WHEN 'gym-sales.sales.drafts' THEN 'فواتير اليوم'
      WHEN 'gym-sales.sales.pos_admin' THEN 'إعدادات نقطة البيع'
    END,
    resource.`route` = CASE resource.`key`
      WHEN 'gym-sales.sales.new_receipt' THEN '/sales/new'
      WHEN 'gym-sales.sales.drafts' THEN '/sales/drafts'
      WHEN 'gym-sales.sales.pos_admin' THEN '/sales/pos-admin'
    END,
    resource.`sort_order` = CASE resource.`key`
      WHEN 'gym-sales.sales.new_receipt' THEN 1
      WHEN 'gym-sales.sales.drafts' THEN 2
      WHEN 'gym-sales.sales.pos_admin' THEN 3
    END,
    resource.`is_active` = TRUE
WHERE resource.`key` IN ('gym-sales.sales.new_receipt', 'gym-sales.sales.drafts', 'gym-sales.sales.pos_admin');

-- Cafe screens, including the two pages that did not previously have independent rows.
UPDATE `rbac_resources` resource
JOIN `rbac_resources` parent ON parent.`key` = 'gym-sales.cafe'
SET resource.`parent_id` = parent.`id`,
    resource.`name_ar` = CASE resource.`key`
      WHEN 'club.cafe.categories' THEN 'فئات الكافيه'
      WHEN 'club.cafe.products' THEN 'منتجات الكافيه'
      WHEN 'club.cafe.reports' THEN 'تقارير الكافيه'
    END,
    resource.`route` = CASE resource.`key`
      WHEN 'club.cafe.categories' THEN '/club/cafe/categories'
      WHEN 'club.cafe.products' THEN '/club/cafe/products'
      WHEN 'club.cafe.reports' THEN '/club/cafe/reports'
    END,
    resource.`sort_order` = CASE resource.`key`
      WHEN 'club.cafe.categories' THEN 1
      WHEN 'club.cafe.products' THEN 2
      WHEN 'club.cafe.reports' THEN 4
    END,
    resource.`is_active` = TRUE
WHERE resource.`key` IN ('club.cafe.categories', 'club.cafe.products', 'club.cafe.reports');

INSERT INTO `rbac_resources`
  (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.cafe.price_list', parent.`id`, 'page', 'قائمة الأسعار', 'Price list', '/inventory/price-list', NULL, 3, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.cafe'
ON DUPLICATE KEY UPDATE
  `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`),
  `route` = VALUES(`route`), `sort_order` = VALUES(`sort_order`), `is_active` = TRUE;

INSERT INTO `rbac_resources`
  (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.cafe.feedback_reports', parent.`id`, 'page', 'تقييمات منتجات الكافيه', 'Cafe product feedback', '/club/cafe/reports/feedback', NULL, 5, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'gym-sales.cafe'
ON DUPLICATE KEY UPDATE
  `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`),
  `route` = VALUES(`route`), `sort_order` = VALUES(`sort_order`), `is_active` = TRUE;

-- Inventory screens.
UPDATE `rbac_resources` resource
JOIN `rbac_resources` parent ON parent.`key` = 'gym-sales.inventory'
SET resource.`parent_id` = parent.`id`,
    resource.`name_ar` = CASE resource.`key`
      WHEN 'gym-sales.inventory.dashboard' THEN 'لوحة تحكم المخزون'
      WHEN 'gym-sales.inventory.raw_materials' THEN 'خامات الكافيه'
      WHEN 'gym-sales.inventory.gym_issue' THEN 'صرف مخزون داخل الجيم'
      WHEN 'gym-sales.inventory.stock_taking' THEN 'الجرد'
      WHEN 'gym-sales.inventory.movement_log' THEN 'الحركات المخزنية'
    END,
    resource.`route` = CASE resource.`key`
      WHEN 'gym-sales.inventory.dashboard' THEN '/inventory/dashboard'
      WHEN 'gym-sales.inventory.raw_materials' THEN '/club/cafe/raw-materials'
      WHEN 'gym-sales.inventory.gym_issue' THEN '/inventory/gym-issue'
      WHEN 'gym-sales.inventory.stock_taking' THEN '/club/cafe/stock-taking'
      WHEN 'gym-sales.inventory.movement_log' THEN '/club/cafe/movements'
    END,
    resource.`sort_order` = CASE resource.`key`
      WHEN 'gym-sales.inventory.dashboard' THEN 1
      WHEN 'gym-sales.inventory.raw_materials' THEN 2
      WHEN 'gym-sales.inventory.gym_issue' THEN 3
      WHEN 'gym-sales.inventory.stock_taking' THEN 4
      WHEN 'gym-sales.inventory.movement_log' THEN 5
    END,
    resource.`is_active` = TRUE
WHERE resource.`key` IN (
  'gym-sales.inventory.dashboard', 'gym-sales.inventory.raw_materials',
  'gym-sales.inventory.gym_issue', 'gym-sales.inventory.stock_taking',
  'gym-sales.inventory.movement_log'
);

-- Procurement screens.
UPDATE `rbac_resources` resource
JOIN `rbac_resources` parent ON parent.`key` = 'gym-sales.procurement'
SET resource.`parent_id` = parent.`id`,
    resource.`name_ar` = CASE resource.`key`
      WHEN 'gym-sales.procurement.suppliers' THEN 'موردو الكافيه'
      WHEN 'gym-sales.procurement.cafe_purchases' THEN 'مشتريات الكافيه'
      WHEN 'gym-sales.procurement.supplier_payments' THEN 'سداد مديونية الموردين'
    END,
    resource.`route` = CASE resource.`key`
      WHEN 'gym-sales.procurement.suppliers' THEN '/club/cafe/suppliers'
      WHEN 'gym-sales.procurement.cafe_purchases' THEN '/club/cafe/purchases'
      WHEN 'gym-sales.procurement.supplier_payments' THEN '/club/cafe/supplier-payments'
    END,
    resource.`sort_order` = CASE resource.`key`
      WHEN 'gym-sales.procurement.suppliers' THEN 1
      WHEN 'gym-sales.procurement.cafe_purchases' THEN 2
      WHEN 'gym-sales.procurement.supplier_payments' THEN 3
    END,
    resource.`is_active` = TRUE
WHERE resource.`key` IN (
  'gym-sales.procurement.suppliers', 'gym-sales.procurement.cafe_purchases',
  'gym-sales.procurement.supplier_payments'
);

-- Preserve explicit grants/denies, exceptions and data scopes when replacing legacy rows.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT permission.`role_id`, current_resource.`id`, permission.`action_id`, permission.`effect`
FROM `rbac_role_permissions` permission
JOIN `rbac_resources` legacy_resource ON legacy_resource.`id` = permission.`resource_id`
JOIN `rbac_resources` current_resource ON current_resource.`key` = CASE legacy_resource.`key`
  WHEN 'club.cafe.pos' THEN 'gym-sales.sales.new_receipt'
  WHEN 'gym-sales.inventory.price_list' THEN 'club.cafe.price_list'
  WHEN 'club.cafe.reports' THEN 'club.cafe.feedback_reports'
END
WHERE legacy_resource.`key` IN ('club.cafe.pos', 'gym-sales.inventory.price_list', 'club.cafe.reports');

INSERT IGNORE INTO `rbac_user_exceptions`
  (`user_id`, `resource_id`, `action_id`, `effect`, `expires_at`, `reason`, `created_by`)
SELECT exception_row.`user_id`, current_resource.`id`, exception_row.`action_id`, exception_row.`effect`,
       exception_row.`expires_at`, exception_row.`reason`, exception_row.`created_by`
FROM `rbac_user_exceptions` exception_row
JOIN `rbac_resources` legacy_resource ON legacy_resource.`id` = exception_row.`resource_id`
JOIN `rbac_resources` current_resource ON current_resource.`key` = CASE legacy_resource.`key`
  WHEN 'club.cafe.pos' THEN 'gym-sales.sales.new_receipt'
  WHEN 'gym-sales.inventory.price_list' THEN 'club.cafe.price_list'
  WHEN 'club.cafe.reports' THEN 'club.cafe.feedback_reports'
END
WHERE legacy_resource.`key` IN ('club.cafe.pos', 'gym-sales.inventory.price_list', 'club.cafe.reports');

INSERT IGNORE INTO `rbac_role_scopes` (`role_id`, `resource_id`, `scope`)
SELECT role_scope.`role_id`, current_resource.`id`, role_scope.`scope`
FROM `rbac_role_scopes` role_scope
JOIN `rbac_resources` legacy_resource ON legacy_resource.`id` = role_scope.`resource_id`
JOIN `rbac_resources` current_resource ON current_resource.`key` = CASE legacy_resource.`key`
  WHEN 'club.cafe.pos' THEN 'gym-sales.sales.new_receipt'
  WHEN 'gym-sales.inventory.price_list' THEN 'club.cafe.price_list'
  WHEN 'club.cafe.reports' THEN 'club.cafe.feedback_reports'
END
WHERE legacy_resource.`key` IN ('club.cafe.pos', 'gym-sales.inventory.price_list', 'club.cafe.reports');

-- Retire pages that no longer exist in the current sidebar.
UPDATE `rbac_resources`
SET `is_active` = FALSE
WHERE `key` IN (
  'club.cafe.pos', 'gym-sales.hub',
  'gym-sales.inventory.settings', 'gym-sales.inventory.products',
  'gym-sales.inventory.price_list', 'gym-sales.inventory.opening_stock',
  'gym-sales.inventory.transactions', 'gym-sales.inventory.policies',
  'gym-sales.inventory.analytics',
  'gym-sales.procurement.dashboard', 'gym-sales.procurement.settings',
  'gym-sales.procurement.requisitions', 'gym-sales.procurement.purchase_orders',
  'gym-sales.procurement.quick_po', 'gym-sales.procurement.goods_receipts',
  'gym-sales.procurement.invoices', 'gym-sales.procurement.returns',
  'gym-sales.procurement.returns_debit',
  'gym-sales.sales.invoices', 'gym-sales.sales.shifts',
  'gym-sales.sales.revenue', 'gym-sales.sales.treasury'
);

-- Synchronize matrix columns for the current module/groups/pages.
DELETE resource_action
FROM `rbac_resource_actions` resource_action
JOIN `rbac_resources` resource ON resource.`id` = resource_action.`resource_id`
WHERE resource.`key` IN (
  'gym-sales', 'gym-sales.sales', 'gym-sales.cafe', 'gym-sales.inventory', 'gym-sales.procurement',
  'gym-sales.sales.new_receipt', 'gym-sales.sales.drafts', 'gym-sales.sales.pos_admin',
  'club.cafe.categories', 'club.cafe.products', 'club.cafe.price_list',
  'club.cafe.reports', 'club.cafe.feedback_reports',
  'gym-sales.inventory.dashboard', 'gym-sales.inventory.raw_materials',
  'gym-sales.inventory.gym_issue', 'gym-sales.inventory.stock_taking',
  'gym-sales.inventory.movement_log', 'gym-sales.procurement.suppliers',
  'gym-sales.procurement.cafe_purchases', 'gym-sales.procurement.supplier_payments'
);

-- Full operational matrix for module headings, groups and POS settings.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN (
  'gym-sales', 'gym-sales.sales', 'gym-sales.cafe', 'gym-sales.inventory',
  'gym-sales.procurement', 'gym-sales.sales.pos_admin'
)
AND action.`key` IN ('view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print', 'audit', 'configure');

-- Standard editable list pages.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN (
  'gym-sales.sales.new_receipt', 'gym-sales.sales.drafts',
  'club.cafe.categories', 'club.cafe.products'
)
AND action.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit');

-- Price list can be viewed and edited, but products are created on the products screen.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'club.cafe.price_list'
AND action.`key` IN ('view', 'update', 'export', 'print', 'audit');

-- Read-only dashboards/reports/logs.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN (
  'club.cafe.reports', 'club.cafe.feedback_reports',
  'gym-sales.inventory.dashboard', 'gym-sales.inventory.movement_log'
)
AND action.`key` IN ('view', 'export', 'print');

-- Operational inventory and purchasing pages.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` IN (
  'gym-sales.inventory.raw_materials', 'gym-sales.inventory.gym_issue',
  'gym-sales.inventory.stock_taking', 'gym-sales.procurement.suppliers',
  'gym-sales.procurement.cafe_purchases', 'gym-sales.procurement.supplier_payments'
)
AND action.`key` IN ('view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print', 'audit');

-- Remove stale explicit cells for actions that are no longer applicable to a current page.
DELETE permission
FROM `rbac_role_permissions` permission
JOIN `rbac_resources` resource ON resource.`id` = permission.`resource_id`
LEFT JOIN `rbac_resource_actions` resource_action
  ON resource_action.`resource_id` = permission.`resource_id`
 AND resource_action.`action_id` = permission.`action_id`
WHERE resource.`key` IN (
  'gym-sales', 'gym-sales.sales', 'gym-sales.cafe', 'gym-sales.inventory', 'gym-sales.procurement',
  'gym-sales.sales.new_receipt', 'gym-sales.sales.drafts', 'gym-sales.sales.pos_admin',
  'club.cafe.categories', 'club.cafe.products', 'club.cafe.price_list',
  'club.cafe.reports', 'club.cafe.feedback_reports',
  'gym-sales.inventory.dashboard', 'gym-sales.inventory.raw_materials',
  'gym-sales.inventory.gym_issue', 'gym-sales.inventory.stock_taking',
  'gym-sales.inventory.movement_log', 'gym-sales.procurement.suppliers',
  'gym-sales.procurement.cafe_purchases', 'gym-sales.procurement.supplier_payments'
)
AND resource_action.`resource_id` IS NULL;

DELETE exception_row
FROM `rbac_user_exceptions` exception_row
JOIN `rbac_resources` resource ON resource.`id` = exception_row.`resource_id`
LEFT JOIN `rbac_resource_actions` resource_action
  ON resource_action.`resource_id` = exception_row.`resource_id`
 AND resource_action.`action_id` = exception_row.`action_id`
WHERE resource.`key` IN (
  'gym-sales', 'gym-sales.sales', 'gym-sales.cafe', 'gym-sales.inventory', 'gym-sales.procurement',
  'gym-sales.sales.new_receipt', 'gym-sales.sales.drafts', 'gym-sales.sales.pos_admin',
  'club.cafe.categories', 'club.cafe.products', 'club.cafe.price_list',
  'club.cafe.reports', 'club.cafe.feedback_reports',
  'gym-sales.inventory.dashboard', 'gym-sales.inventory.raw_materials',
  'gym-sales.inventory.gym_issue', 'gym-sales.inventory.stock_taking',
  'gym-sales.inventory.movement_log', 'gym-sales.procurement.suppliers',
  'gym-sales.procurement.cafe_purchases', 'gym-sales.procurement.supplier_payments'
)
AND resource_action.`resource_id` IS NULL;
