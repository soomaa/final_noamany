-- HR review of offline-synced mobile punches («بصمات أوفلاين للمراجعة», 25 Nov 2026).
-- Hand-written; re-runnable (IF NOT EXISTS).
-- Production never regenerates the Prisma Client: this table is used through raw SQL only
-- (AttendanceOfflineReviewService).
--
-- One row per reviewed mobile_offline_attendance_sync row. No row = still waiting for review.
-- 'rejected' means the punch's effect on tbl_hdoor_emps was removed; removed_json keeps the
-- values that were cleared so the decision can be audited.
CREATE TABLE IF NOT EXISTS `attendance_offline_punch_reviews` (
    `sync_id` INTEGER NOT NULL,
    `decision` VARCHAR(10) NOT NULL,            -- approved | rejected
    `reason` VARCHAR(500) NULL,
    `removed_json` TEXT NULL,
    `reviewed_by` INTEGER NOT NULL,
    `reviewed_by_name` VARCHAR(100) NULL,
    `reviewed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_offline_review_decision`(`decision`, `reviewed_at`),
    PRIMARY KEY (`sync_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Excel fingerprint imports now replay through the attendance engine and audit into
-- attendance_device_punches with device_id = 0 when no device is chosen (no schema change).
