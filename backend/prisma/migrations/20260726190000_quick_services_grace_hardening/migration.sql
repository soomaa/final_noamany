-- 1) Receipts carry their own branch.
-- Walk-in quick-service receipts have neither a subscription nor a member, so the branch could
-- not be derived — they were skipped by the GL posting and by every branch-scoped report.
ALTER TABLE `club_receipts` ADD COLUMN `branch_id` INTEGER NULL AFTER `member_name`;
CREATE INDEX `club_receipts_branch_id_idx` ON `club_receipts`(`branch_id`);

UPDATE `club_receipts` r
JOIN `club_subscriptions` s ON s.`id` = r.`subscription_id`
SET r.`branch_id` = s.`branch_id`
WHERE r.`branch_id` IS NULL;

UPDATE `club_receipts` r
JOIN `club_members` m ON m.`id` = r.`member_id`
SET r.`branch_id` = m.`branch_id`
WHERE r.`branch_id` IS NULL;

-- 2) Grace sessions are a first-class attendance fact, not a note prefix.
ALTER TABLE `club_attendance`
  ADD COLUMN `is_grace_session` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `override_reason` VARCHAR(255) NULL;
CREATE INDEX `club_attendance_is_grace_session_attendance_date_idx`
  ON `club_attendance`(`is_grace_session`, `attendance_date`);

-- 3) Register the Quick Services page so it can be granted/revoked on its own.
INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.reception.quick_services', parent.`id`, 'page', 'خدمات سريعة', 'Quick services', '/club/reception/quick-services', NULL, 2, TRUE
FROM `rbac_resources` parent WHERE parent.`key` = 'club.membership'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `is_active` = TRUE;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'club.reception.quick_services'
  AND action.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit');

-- Anyone who can already work the reception desk keeps seeing and selling quick services.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT existing.`role_id`, quick.`id`, existing.`action_id`, 'allow'
FROM `rbac_role_permissions` existing
JOIN `rbac_resources` reception ON reception.`id` = existing.`resource_id` AND reception.`key` = 'club.reception'
JOIN `rbac_resources` quick ON quick.`key` = 'club.reception.quick_services'
JOIN `rbac_resource_actions` allowed ON allowed.`resource_id` = quick.`id` AND allowed.`action_id` = existing.`action_id`
WHERE existing.`effect` = 'allow';

-- 4) Grace sessions need an approval action of their own on the reception page.
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'club.reception'
  AND action.`key` IN ('approve', 'reject');

-- Grandfather the current behaviour: whoever could force a check-in until now (reception:create)
-- keeps that power as an explicit Approve grant, so nobody is locked out on deploy.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT existing.`role_id`, existing.`resource_id`, approve.`id`, 'allow'
FROM `rbac_role_permissions` existing
JOIN `rbac_resources` reception ON reception.`id` = existing.`resource_id` AND reception.`key` = 'club.reception'
JOIN `rbac_actions` create_action ON create_action.`id` = existing.`action_id` AND create_action.`key` = 'create'
JOIN `rbac_actions` approve ON approve.`key` = 'approve'
WHERE existing.`effect` = 'allow';
