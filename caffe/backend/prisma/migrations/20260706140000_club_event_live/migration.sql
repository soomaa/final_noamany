-- Live event display settings + program segments (فقرات)

CREATE TABLE `club_event_display_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `event_id` INT NOT NULL,
  `data` JSON NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `club_event_display_settings_event_id_key`(`event_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_event_program_segments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `event_id` INT NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `description` TEXT NULL,
  `kind` VARCHAR(20) NOT NULL DEFAULT 'text',
  `media_urls` JSON NULL,
  `video_url` VARCHAR(2048) NULL,
  `duration_seconds` INT NOT NULL DEFAULT 0,
  `order_index` INT NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `scheduled_time` VARCHAR(8) NULL,
  `duration_minutes` INT NULL,
  `show_duration` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  INDEX `club_event_program_segments_event_id_order_index_idx`(`event_id`, `order_index`),
  INDEX `club_event_program_segments_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_event_display_settings`
  ADD CONSTRAINT `club_event_display_settings_event_id_fkey`
  FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `club_event_program_segments`
  ADD CONSTRAINT `club_event_program_segments_event_id_fkey`
  FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
