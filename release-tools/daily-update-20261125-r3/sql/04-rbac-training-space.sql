-- RBAC page «مساحة التدريب» under «إدارة النادي ← المدربين» (club.fitness), same as rbac.catalog.ts.
-- Super-admins see it at once; other roles get it from «الأدوار والصلاحيات».
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.fitness.training_space', p.id, 'page', 'مساحة التدريب', 'Training space', '/club/fitness/training-space', NULL, 1, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'club.fitness' LIMIT 1) p;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit')
WHERE r.`key` = 'club.fitness.training_space';

-- The groups page now carries the Gymora name.
UPDATE `rbac_resources` SET `name_ar` = 'مجموعات الأعضاء', `name_en` = 'Member groups' WHERE `key` = 'club.members.groups';
