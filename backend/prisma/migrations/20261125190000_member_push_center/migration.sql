-- «إشعارات الموبايل للأعضاء»: scheduled campaigns, send history, per-member results, settings,
-- and the RBAC page app-management.push. Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS `push_campaigns` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `preset` VARCHAR(40) NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `type` VARCHAR(40) NOT NULL DEFAULT 'general',
  `link` VARCHAR(500) NULL,
  `image_url` VARCHAR(500) NULL,
  `audience` TEXT NOT NULL,
  `in_app` BOOLEAN NOT NULL DEFAULT true,
  `schedule_kind` VARCHAR(10) NOT NULL,
  `run_at` DATETIME(3) NULL,
  `time_of_day` VARCHAR(5) NULL,
  `weekdays` VARCHAR(20) NULL,
  `month_day` INTEGER NULL,
  `interval_days` INTEGER NULL,
  `start_date` VARCHAR(10) NULL,
  `end_date` VARCHAR(10) NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'active',
  `next_run_at` DATETIME(3) NULL,
  `last_run_at` DATETIME(3) NULL,
  `last_send_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `push_campaigns_status_next_run_at_idx`(`status`, `next_run_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_sends` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaign_id` INTEGER NULL,
  `run_key` VARCHAR(80) NULL,
  `trigger` VARCHAR(10) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `type` VARCHAR(40) NOT NULL DEFAULT 'general',
  `link` VARCHAR(500) NULL,
  `image_url` VARCHAR(500) NULL,
  `audience` TEXT NOT NULL,
  `audience_summary` VARCHAR(500) NULL,
  `delivery` VARCHAR(10) NOT NULL DEFAULT 'tokens',
  `topic_condition` VARCHAR(500) NULL,
  `in_app` BOOLEAN NOT NULL DEFAULT true,
  `members_count` INTEGER NOT NULL DEFAULT 0,
  `devices_count` INTEGER NOT NULL DEFAULT 0,
  `sent_count` INTEGER NOT NULL DEFAULT 0,
  `failed_count` INTEGER NOT NULL DEFAULT 0,
  `invalid_count` INTEGER NOT NULL DEFAULT 0,
  `limited_count` INTEGER NOT NULL DEFAULT 0,
  `opened_count` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(10) NOT NULL DEFAULT 'running',
  `error` TEXT NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  UNIQUE INDEX `uq_push_sends_run_key`(`run_key`),
  INDEX `push_sends_campaign_id_idx`(`campaign_id`),
  INDEX `push_sends_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_send_recipients` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `send_id` INTEGER NOT NULL,
  `member_id` INTEGER NOT NULL,
  `status` VARCHAR(10) NOT NULL,
  `opened_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_push_send_recipients`(`send_id`, `member_id`),
  INDEX `push_send_recipients_member_id_created_at_idx`(`member_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_settings` (
  `id` INTEGER NOT NULL,
  `quiet_enabled` BOOLEAN NOT NULL DEFAULT true,
  `quiet_start` VARCHAR(5) NOT NULL DEFAULT '23:00',
  `quiet_end` VARCHAR(5) NOT NULL DEFAULT '08:00',
  `quiet_mode` VARCHAR(10) NOT NULL DEFAULT 'defer',
  `default_type` VARCHAR(40) NOT NULL DEFAULT 'general',
  `daily_limit` INTEGER NOT NULL DEFAULT 3,
  `last_error` TEXT NULL,
  `last_error_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `push_settings` (`id`) VALUES (1);

-- RBAC catalog row (seed-rbac.ts upserts the same from rbac.catalog.ts; this makes the page
-- appear without re-running the seed). Parent: the «المحتوى والعروض» group next to
-- «إشعارات الأعضاء», or the app-management module on a catalog without that group.
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'app-management.push', p.id, 'page', 'إشعارات الموبايل للأعضاء', 'Member push notifications', '/app/push-notifications', NULL, 9, true
FROM (SELECT `id` FROM `rbac_resources` WHERE `key` IN ('app-management.content', 'app-management') ORDER BY (`key` = 'app-management.content') DESC LIMIT 1) p;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a
  ON a.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit')
WHERE r.`key` = 'app-management.push';
