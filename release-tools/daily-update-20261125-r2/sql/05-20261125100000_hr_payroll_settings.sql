-- «إعدادات الحضور والمرتبات»: owner-editable HR / payroll rules (late cap, permitted lateness,
-- missing-punch ladder, absence / leave multipliers, overtime value, comp-day rules, default off day,
-- deduction-exempt employees). One row per CHANGED rule; a missing row = the built-in default, which
-- equals the behaviour before this page existed. setting_value holds JSON (true, 0.25, "Friday", [27,2]).
-- Hand-written and idempotent: production never runs `prisma generate`; the code uses raw SQL and
-- falls back to the defaults when this table is missing.
CREATE TABLE IF NOT EXISTS `hr_payroll_settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` TEXT NULL,
  `updated_by` INTEGER NULL,
  `updated_by_name` VARCHAR(150) NULL,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- RBAC page `payroll.attendance_settings` under «الرواتب» (seed-rbac.ts upserts the same from
-- rbac.catalog.ts; this makes it appear without re-running the seed). Super-admins bypass; HR roles
-- inherit it from their `hr` grant; hr_manager also gets view/update explicitly below.
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'payroll.attendance_settings', p.id, 'page', 'إعدادات الحضور والمرتبات', 'Attendance & payroll rules', '/hr/payroll-settings', NULL, 7, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'payroll' LIMIT 1) p;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'update', 'configure', 'audit')
WHERE r.`key` = 'payroll.attendance_settings';

INSERT INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT ro.id, r.id, a.id, 'allow'
FROM `rbac_roles` ro
JOIN `rbac_resources` r ON r.`key` = 'payroll.attendance_settings'
JOIN `rbac_actions` a ON a.`key` IN ('view', 'update')
WHERE ro.`key` = 'hr_manager'
  AND NOT EXISTS (
    SELECT 1 FROM `rbac_role_permissions` x
    WHERE x.role_id = ro.id AND x.resource_id = r.id AND x.action_id = a.id
  );
