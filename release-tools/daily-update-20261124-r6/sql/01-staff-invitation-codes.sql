-- «أكواد الدعوات للموظفين» (Noamany meeting, 24 Nov 2026): every captain / employee gets an
-- invitation code with a monthly allowance; each guest recorded with it becomes a sales lead.
-- Written to be re-runnable (IF NOT EXISTS / information_schema guards / INSERT IGNORE).

CREATE TABLE IF NOT EXISTS `club_staff_invitation_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `monthly_quota` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_staff_invitation_codes_employee_id_key`(`employee_id`),
    UNIQUE INDEX `club_staff_invitation_codes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_staff_invitation_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `delta` INTEGER NOT NULL DEFAULT 0,
    `quota_before` INTEGER NULL,
    `quota_after` INTEGER NULL,
    `period` VARCHAR(7) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_staff_invitation_adjustments_code_id_period_idx`(`code_id`, `period`),
    INDEX `club_staff_invitation_adjustments_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_staff_invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `guest_name` VARCHAR(200) NOT NULL,
    `guest_phone` VARCHAR(50) NOT NULL,
    `phone_key` VARCHAR(30) NOT NULL,
    `visit_date` VARCHAR(10) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `branch_id` INTEGER NULL,
    `notes` TEXT NULL,
    `lead_id` INTEGER NULL,
    `over_quota` BOOLEAN NOT NULL DEFAULT false,
    `override_reason` VARCHAR(500) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_staff_invitations_employee_id_period_idx`(`employee_id`, `period`),
    INDEX `club_staff_invitations_code_id_period_idx`(`code_id`, `period`),
    INDEX `club_staff_invitations_phone_key_idx`(`phone_key`),
    INDEX `club_staff_invitations_lead_id_idx`(`lead_id`),
    INDEX `club_staff_invitations_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_staff_invitation_settings` (
    `id` INTEGER NOT NULL,
    `duplicate_window_days` INTEGER NOT NULL DEFAULT 30,
    `default_monthly_quota` INTEGER NOT NULL DEFAULT 5,
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `club_staff_invitation_settings` (`id`, `duplicate_window_days`, `default_monthly_quota`, `updated_at`)
VALUES (1, 30, 5, CURRENT_TIMESTAMP(3));

-- club_leads: who invited the guest (kept even when another rep works the lead).
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'club_leads' AND COLUMN_NAME = 'staff_invitation_id');
SET @sql := IF(@col = 0, 'ALTER TABLE `club_leads` ADD COLUMN `staff_invitation_id` INTEGER NULL, ADD INDEX `club_leads_staff_invitation_id_idx`(`staff_invitation_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'club_leads' AND COLUMN_NAME = 'invited_by_employee_id');
SET @sql := IF(@col = 0, 'ALTER TABLE `club_leads` ADD COLUMN `invited_by_employee_id` INTEGER NULL, ADD INDEX `club_leads_invited_by_employee_id_idx`(`invited_by_employee_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- RBAC catalog rows (seed-rbac.ts upserts the same from rbac.catalog.ts; this makes the page
-- appear without re-running the seed). Parent: «إدارة المبيعات», or the club module on a
-- database whose catalog predates that group.
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.staff_invitations', p.id, 'page', 'أكواد الدعوات للموظفين', 'Staff invitation codes', '/club/staff-invitations', NULL, 60, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` IN ('club.sales-management', 'club') ORDER BY (`key` = 'club.sales-management') DESC LIMIT 1) p;

INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'club.staff_invitations.mine', p.id, 'page', 'كود الدعوات الخاص بي', 'My invitation code', '/club/my-invitation-code', NULL, 61, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` IN ('club.sales-management', 'club') ORDER BY (`key` = 'club.sales-management') DESC LIMIT 1) p;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'create', 'update', 'delete', 'approve', 'export', 'print', 'audit')
WHERE r.`key` = 'club.staff_invitations';

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'print')
WHERE r.`key` = 'club.staff_invitations.mine';

-- Every staff role can open «كود الدعوات الخاص بي» (own code, allowance and guests only — the
-- API scopes it to the signed-in employee). Admins can take it away per role afterwards.
INSERT INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT ro.id, r.id, a.id, 'allow'
FROM `rbac_roles` ro
JOIN `rbac_resources` r ON r.`key` = 'club.staff_invitations.mine'
JOIN `rbac_actions` a ON a.`key` = 'view'
WHERE (ro.`key` LIKE 'job\_title\_%' OR ro.`key` IN ('employee', 'trainer', 'branch_manager'))
  AND NOT EXISTS (
    SELECT 1 FROM `rbac_role_permissions` x
    WHERE x.role_id = ro.id AND x.resource_id = r.id AND x.action_id = a.id
  );
