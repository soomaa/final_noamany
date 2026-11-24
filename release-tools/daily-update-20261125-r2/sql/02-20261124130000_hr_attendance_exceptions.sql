-- «الحالات اليومية» (daily attendance exceptions): the branch manager's decision on every abnormal
-- attendance case (no punch, missing check-in/out, late, early leave). Read by payroll.
-- Hand-written: production never runs `prisma generate`; the code reads/writes this table with raw SQL.
-- shift_id 0 = the whole day (unique keys ignore NULLs in MySQL, so 0 is stored instead).
CREATE TABLE IF NOT EXISTS `hr_attendance_exception_resolutions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `emp_code` INTEGER NOT NULL,
  `work_date` CHAR(10) NOT NULL,
  `shift_id` INTEGER NOT NULL DEFAULT 0,
  `branch_id` INTEGER NULL,
  `case_type` VARCHAR(30) NOT NULL,
  `decision` VARCHAR(20) NOT NULL,
  `check_in` VARCHAR(10) NULL,
  `check_out` VARCHAR(10) NULL,
  `leave_type_id` INTEGER NULL,
  `reason` VARCHAR(500) NOT NULL,
  `attendance_id` INTEGER NULL,
  `created_row` TINYINT NOT NULL DEFAULT 0,
  `resolved_by` INTEGER NULL,
  `resolved_by_name` VARCHAR(150) NULL,
  `resolved_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_attendance_exception_emp_date_shift`(`emp_code`, `work_date`, `shift_id`),
  INDEX `idx_attendance_exception_date_branch`(`work_date`, `branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- RBAC page `attendance.exceptions` under «الحضور والانصراف» (seed-rbac.ts upserts the same from
-- rbac.catalog.ts; this makes it appear without re-running the seed). Super-admins bypass; HR roles
-- inherit it from their `hr` grant; hr_manager also gets it explicitly below.
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'attendance.exceptions', p.id, 'page', 'الحالات اليومية', 'Daily attendance cases', '/attendance/exceptions', NULL, 1, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` = 'attendance' LIMIT 1) p;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'update', 'export', 'print', 'audit')
WHERE r.`key` = 'attendance.exceptions';

INSERT INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT ro.id, r.id, a.id, 'allow'
FROM `rbac_roles` ro
JOIN `rbac_resources` r ON r.`key` = 'attendance.exceptions'
JOIN `rbac_actions` a ON a.`key` IN ('view', 'update')
WHERE ro.`key` = 'hr_manager'
  AND NOT EXISTS (
    SELECT 1 FROM `rbac_role_permissions` x
    WHERE x.role_id = ro.id AND x.resource_id = r.id AND x.action_id = a.id
  );
