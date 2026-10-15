CREATE TABLE `gate_credentials` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `member_id` INTEGER NOT NULL,
  `credential_no` VARCHAR(20) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `gate_credentials_member_id_key`(`member_id`),
  UNIQUE INDEX `gate_credentials_credential_no_key`(`credential_no`),
  INDEX `gate_credentials_is_active_updated_at_idx`(`is_active`, `updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gate_controllers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `model` VARCHAR(40) NOT NULL DEFAULT 'C3-200',
  `static_ip` VARCHAR(45) NOT NULL,
  `port` INTEGER NOT NULL DEFAULT 4370,
  `entry_door_no` INTEGER NOT NULL DEFAULT 1,
  `exit_door_no` INTEGER NOT NULL DEFAULT 2,
  `agent_token_hash` CHAR(64) NOT NULL,
  `agent_token_prefix` VARCHAR(12) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'never_connected',
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `last_seen_at` DATETIME(3) NULL,
  `last_sync_at` DATETIME(3) NULL,
  `firmware_version` VARCHAR(80) NULL,
  `serial_number` VARCHAR(80) NULL,
  `agent_version` VARCHAR(40) NULL,
  `last_error` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `gate_controllers_branch_id_is_active_idx`(`branch_id`, `is_active`),
  INDEX `gate_controllers_last_seen_at_idx`(`last_seen_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gate_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `controller_id` INTEGER NOT NULL,
  `event_fingerprint` CHAR(64) NOT NULL,
  `credential_no` VARCHAR(20) NULL,
  `member_id` INTEGER NULL,
  `door_no` INTEGER NULL,
  `direction` VARCHAR(20) NOT NULL DEFAULT 'unknown',
  `event_type` INTEGER NOT NULL,
  `event_time` DATETIME(3) NOT NULL,
  `accepted` BOOLEAN NOT NULL,
  `reason_code` VARCHAR(80) NULL,
  `reason_message` VARCHAR(500) NULL,
  `attendance_id` INTEGER NULL,
  `raw_data` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gate_events_event_fingerprint_key`(`event_fingerprint`),
  INDEX `gate_events_controller_id_event_time_idx`(`controller_id`, `event_time`),
  INDEX `gate_events_member_id_event_time_idx`(`member_id`, `event_time`),
  INDEX `gate_events_accepted_event_time_idx`(`accepted`, `event_time`),
  INDEX `gate_events_credential_no_idx`(`credential_no`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gate_commands` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `controller_id` INTEGER NOT NULL,
  `type` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `result` JSON NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `delivered_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  INDEX `gate_commands_controller_id_status_created_at_idx`(`controller_id`, `status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `gate_credentials`
  ADD CONSTRAINT `gate_credentials_member_id_fkey`
  FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `gate_events`
  ADD CONSTRAINT `gate_events_controller_id_fkey`
  FOREIGN KEY (`controller_id`) REFERENCES `gate_controllers`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `gate_events_member_id_fkey`
  FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `gate_commands`
  ADD CONSTRAINT `gate_commands_controller_id_fkey`
  FOREIGN KEY (`controller_id`) REFERENCES `gate_controllers`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;
