-- Training space (مساحة التدريب) ported from Gymora: plans, assignments, sessions, exercise profiles,
-- metrics, events, body check-ins/targets, progress photos, coach recordings, and the equipment
-- library columns on club_equipment. Idempotent (IF NOT EXISTS / column checks).


SET @training_port_sql := (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `club_equipment` ADD COLUMN `category` VARCHAR(30) NULL', 'SELECT 1')
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'club_equipment' AND `COLUMN_NAME` = 'category'
);
PREPARE training_port_stmt FROM @training_port_sql;
EXECUTE training_port_stmt;
DEALLOCATE PREPARE training_port_stmt;

SET @training_port_sql := (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `club_equipment` ADD COLUMN `image_url` VARCHAR(1000) NULL', 'SELECT 1')
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'club_equipment' AND `COLUMN_NAME` = 'image_url'
);
PREPARE training_port_stmt FROM @training_port_sql;
EXECUTE training_port_stmt;
DEALLOCATE PREPARE training_port_stmt;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `goal` VARCHAR(500) NULL,
    `weeks` INTEGER NOT NULL DEFAULT 8,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `branch_id` INTEGER NOT NULL,
    `days` JSON NOT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `training_plans_branch_id_status_idx`(`branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `trainer_id` INTEGER NULL,
    `plan_id` INTEGER NOT NULL,
    `plan_revision` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `start_date` VARCHAR(10) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `handover_note` TEXT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `training_assignments_member_id_is_active_idx`(`member_id`, `is_active`),
    INDEX `training_assignments_trainer_id_is_active_idx`(`trainer_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_sessions` (
    `id` VARCHAR(80) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `assignment_id` INTEGER NULL,
    `day_id` VARCHAR(80) NULL,
    `date` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `entries` JSON NOT NULL,
    `note` TEXT NULL,
    `author` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `training_sessions_member_id_date_idx`(`member_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_exercise_profiles` (
    `key` VARCHAR(80) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'strength',
    `primary_muscles` JSON NOT NULL,
    `secondary_muscles` JSON NOT NULL,
    `instructions` TEXT NULL,
    `video_url` VARCHAR(1000) NULL,
    `equipment_ids` JSON NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_metrics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `test_key` VARCHAR(100) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `side` VARCHAR(10) NOT NULL DEFAULT 'both',
    `value` DECIMAL(10, 3) NOT NULL,
    `protocol` VARCHAR(500) NOT NULL,
    `author` VARCHAR(80) NOT NULL,

    INDEX `training_metrics_member_id_test_key_date_idx`(`member_id`, `test_key`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `note` TEXT NOT NULL,
    `author` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `training_events_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_body_checkins` (
    `id` VARCHAR(80) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `measurements` JSON NOT NULL,
    `note` VARCHAR(1000) NOT NULL,
    `author` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `training_body_checkins_member_id_date_created_at_idx`(`member_id`, `date`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_body_targets` (
    `member_id` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `measurements` JSON NOT NULL,
    `target_date` VARCHAR(10) NULL,
    `note` VARCHAR(1000) NOT NULL,
    `author` VARCHAR(80) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_photos` (
    `id` VARCHAR(80) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `angle` VARCHAR(20) NOT NULL,
    `shared_with_coach` BOOLEAN NOT NULL DEFAULT false,
    `mime` VARCHAR(40) NOT NULL,
    `content` LONGBLOB NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `training_photos_member_id_angle_date_idx`(`member_id`, `angle`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `training_recordings` (
    `id` VARCHAR(36) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `assignment_id` INTEGER NULL,
    `day_id` VARCHAR(80) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `mime` VARCHAR(60) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `duration_seconds` INTEGER NULL,
    `storage_key` VARCHAR(255) NULL,
    `share_token` CHAR(43) NOT NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `expires_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `training_recordings_share_token_key`(`share_token`),
    INDEX `training_recordings_member_id_assignment_id_idx`(`member_id`, `assignment_id`),
    INDEX `training_recordings_expires_at_deleted_at_idx`(`expires_at`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
