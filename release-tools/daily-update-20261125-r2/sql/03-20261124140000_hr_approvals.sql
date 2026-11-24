-- HR approvals (Noamany meeting, 24 Nov 2026).
-- Hand-written; re-runnable (IF NOT EXISTS / information_schema guards / INSERT IGNORE).
-- Production never regenerates the Prisma Client: everything new here is used through raw SQL.

-- 1) Employee overtime requests: direct manager -> HR; on final approval ('approved') the hours are
--    recorded in tbl_emps_hours_edafi through AttendanceService.createExtraHours.
CREATE TABLE IF NOT EXISTS `hr_overtime_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_code_fk` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `branch_id_fk` INTEGER NULL,
    `request_date` CHAR(10) NOT NULL,
    `hours` INTEGER NOT NULL,
    `reason` VARCHAR(500) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',      -- pending | approved | rejected | cancelled
    `stage` VARCHAR(30) NULL,                             -- approve_direct_manager | approve_hr | NULL when closed
    `approve_direct_manager` VARCHAR(8) NOT NULL DEFAULT 'wait',
    `approve_hr` VARCHAR(8) NOT NULL DEFAULT 'wait',
    `direct_manager_user_id` INTEGER NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `decided_by` INTEGER NULL,
    `decision_reason` VARCHAR(255) NULL,
    `extra_hours_id` INTEGER NULL,
    `extra_hours_message` VARCHAR(500) NULL,
    `history` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL,

    INDEX `idx_overtime_emp_date`(`emp_id_fk`, `request_date`),
    INDEX `idx_overtime_inbox`(`current_to_user_id`, `status`),
    INDEX `idx_overtime_branch`(`branch_id_fk`, `status`),
    INDEX `idx_overtime_publisher`(`publisher`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) Partial leave approval: the originally requested range (the order row itself carries the
--    approved range). NULL = never narrowed.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_all_agzat_orders' AND COLUMN_NAME = 'requested_from_date_m');
SET @sql := IF(@col = 0, 'ALTER TABLE `hr_all_agzat_orders` ADD COLUMN `requested_from_date_m` VARCHAR(20) NULL, ADD COLUMN `requested_to_date_m` VARCHAR(20) NULL, ADD COLUMN `requested_num_days` FLOAT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Existing branch-manager job-title roles get the new HR cells. Only missing cells are added
--    (INSERT IGNORE on the role/resource/action unique key): custom grants and explicit Denies stay.
--    Resources not in rbac_resources yet (e.g. attendance.exceptions before its module is seeded)
--    are skipped: re-run `npm run db:apply:branch-manager-hr-defaults` later.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT r.`id`, res.`id`, a.`id`, 'allow'
  FROM `rbac_roles` r
  JOIN `rbac_resources` res
  JOIN `rbac_actions` a
 WHERE r.`key` LIKE 'job\_title\_%'
   AND (r.`name_ar` REGEXP 'مدير[ةه]? ?(ال)?فرع' OR r.`name_ar` REGEXP 'مشرف[ةه]? ?(ال)?[إا]دار[ةه] ?(ال)?(حريمي|رجالي)')
   AND CONCAT(res.`key`, ':', a.`key`) IN (
        'leaves.list:view', 'leaves.list:approve', 'leaves.list:reject',
        'leaves.permissions:view', 'leaves.permissions:create', 'leaves.permissions:approve', 'leaves.permissions:reject',
        'leaves.requests:view', 'leaves.requests:create', 'leaves.requests:approve', 'leaves.requests:reject',
        'attendance.adjustments:view', 'attendance.adjustments:create',
        'affairs.daily_reports:view',
        'attendance.exceptions:view', 'attendance.exceptions:update'
   );
