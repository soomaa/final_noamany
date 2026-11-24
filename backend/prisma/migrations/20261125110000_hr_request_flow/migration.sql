-- HR request flow (Noamany, 25 Nov 2026): return-with-comment, request timeline, manager overtime
-- entries routed to HR, HR inbox.
-- Hand-written; re-runnable (IF NOT EXISTS / information_schema guards).
-- Production never regenerates the Prisma Client: everything new here is used through raw SQL.

-- 1) Timeline of every decision on leaves / permissions / generic requests (who, action, comment,
--    when). The legacy history tables keep 30-character messages, too short for a comment.
--    Overtime requests keep their own JSON history (hr_overtime_requests.history).
CREATE TABLE IF NOT EXISTS `hr_request_timeline` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_type` VARCHAR(20) NOT NULL,                  -- leave | permission | request
    `request_id` INTEGER NOT NULL,
    `action` VARCHAR(20) NOT NULL,                        -- submit | accept | reject | return | resubmit | cancel | skip
    `stage` VARCHAR(30) NULL,                             -- approve_direct_manager | approve_hr | approve_moder_edara | ...
    `actor_user_id` INTEGER NULL,
    `actor_name` VARCHAR(100) NULL,
    `to_user_id` INTEGER NULL,
    `to_user_name` VARCHAR(100) NULL,
    `comment` VARCHAR(1000) NULL,
    `override` TINYINT NOT NULL DEFAULT 0,                -- 1 = HR / admin acted instead of the routed approver
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_req_timeline_request`(`request_type`, `request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) "Returned for changes" state of a leave / permission. The legacy tables keep their enum
--    columns untouched (suspend and the stage flags stay as they were); an open row here means the
--    request waits for its requester to edit and resubmit, restarting at `stage`.
CREATE TABLE IF NOT EXISTS `hr_request_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_type` VARCHAR(20) NOT NULL,                  -- leave | permission
    `request_id` INTEGER NOT NULL,
    `stage` VARCHAR(30) NOT NULL,                         -- the step that returned it (and resumes it)
    `returned_by` INTEGER NULL,
    `returned_by_name` VARCHAR(100) NULL,
    `returned_to_user_id` INTEGER NULL,
    `comment` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'open',         -- open | resubmitted | closed
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `resolved_at` DATETIME(0) NULL,

    INDEX `idx_req_returns_request`(`request_type`, `request_id`, `status`),
    INDEX `idx_req_returns_to`(`returned_to_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Overtime requests entered by a direct manager (source 'manager', start at the HR step) and
--    extra-shift requests (kind 'shift', recorded as tbl_emps_shef_edafi ttype 2 on approval).
--    status gains 'returned' (VARCHAR column, no DDL needed for the value itself).
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_overtime_requests' AND COLUMN_NAME = 'source');
SET @sql := IF(@col = 0, 'ALTER TABLE `hr_overtime_requests` ADD COLUMN `source` VARCHAR(10) NOT NULL DEFAULT ''employee''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_overtime_requests' AND COLUMN_NAME = 'kind');
SET @sql := IF(@col = 0, 'ALTER TABLE `hr_overtime_requests` ADD COLUMN `kind` VARCHAR(10) NOT NULL DEFAULT ''hours''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_overtime_requests' AND COLUMN_NAME = 'shift_id');
SET @sql := IF(@col = 0, 'ALTER TABLE `hr_overtime_requests` ADD COLUMN `shift_id` INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_overtime_requests' AND COLUMN_NAME = 'returned_stage');
SET @sql := IF(@col = 0, 'ALTER TABLE `hr_overtime_requests` ADD COLUMN `returned_stage` VARCHAR(30) NULL, ADD COLUMN `return_comment` VARCHAR(1000) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- `hours` stays NOT NULL: a shift request stores 0.
