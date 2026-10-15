ALTER TABLE `attendance_devices`
  ADD COLUMN `credential_hash` CHAR(64) NULL,
  ADD COLUMN `credential_rotated_at` DATETIME(3) NULL;

CREATE TABLE `attendance_device_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_id` INT NOT NULL,
  `provider_event_id` VARCHAR(120) NOT NULL,
  `employee_code` INT NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `event_type` VARCHAR(8) NOT NULL,
  `payload_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'received',
  `attendance_record_id` INT NULL,
  `error_code` VARCHAR(60) NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_device_provider_event` (`device_id`, `provider_event_id`),
  KEY `idx_attendance_device_events_occurred` (`device_id`, `occurred_at`),
  KEY `idx_attendance_device_events_status` (`status`, `received_at`),
  CONSTRAINT `fk_attendance_device_events_device`
    FOREIGN KEY (`device_id`) REFERENCES `attendance_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
