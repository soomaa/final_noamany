INSERT INTO `rbac_resources`
  (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.cafe.waste', parent.`id`, 'page', 'الهالك والفاقد', 'Waste and loss', '/club/cafe/waste', NULL, 4, TRUE
FROM `rbac_resources` parent
WHERE parent.`key` = 'gym-sales.cafe'
ON DUPLICATE KEY UPDATE
  `parent_id` = VALUES(`parent_id`),
  `name_ar` = VALUES(`name_ar`),
  `name_en` = VALUES(`name_en`),
  `route` = VALUES(`route`),
  `sort_order` = VALUES(`sort_order`),
  `is_active` = TRUE;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'club.cafe.waste'
  AND action.`key` IN ('view', 'create', 'update', 'export', 'print', 'audit');
