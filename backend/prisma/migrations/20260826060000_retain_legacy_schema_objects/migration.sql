-- Canonical compatibility bridge for databases originally created with legacy db push.
-- Fresh migration installs lacked these retained tables and columns, while upgraded databases
-- already contained them. Every statement is idempotent; no business row is deleted or changed.

CREATE TABLE IF NOT EXISTS `club_approval_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','declined') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `requested_by` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_by` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_approval_items_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_availability_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module_type` varchar(20) NOT NULL,
  `branch_id` int DEFAULT NULL,
  `trainer_id` int DEFAULT NULL,
  `service_id` int DEFAULT NULL,
  `slot_date` varchar(10) NOT NULL,
  `start_time` varchar(8) NOT NULL,
  `end_time` varchar(8) NOT NULL,
  `capacity` int NOT NULL DEFAULT '1',
  `booked_count` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `club_availability_slots_module_type_slot_date_idx` (`module_type`,`slot_date`),
  KEY `club_availability_slots_branch_id_idx` (`branch_id`),
  KEY `club_availability_slots_trainer_id_idx` (`trainer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `club_branch_visits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `visit_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `visit_time` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_branch_visits_visit_date_idx` (`visit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_calls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `call_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `call_time` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `outcome` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `staff_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_calls_call_date_idx` (`call_date`),
  KEY `club_calls_member_id_idx` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_class_rooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int NOT NULL DEFAULT '20',
  `branch_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_class_rooms_branch_id_idx` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_closing_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `closing_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int DEFAULT NULL,
  `total_cash` decimal(12,2) NOT NULL,
  `total_card` decimal(12,2) NOT NULL,
  `total_other` decimal(12,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `closed_by` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_closing_transactions_closing_date_idx` (`closing_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_commission_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kind` enum('sales_range','sales_percentage','sales_target','trainer_range','trainer_percentage','trainer_target','instructor_class_rate','package_commission','fixed_trainer_commission') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` json NOT NULL,
  `branch_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_commission_rules_kind_is_active_idx` (`kind`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_content_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content_type` enum('faq','exercise','announcement','gym_image','schedule_image','transformation_image','app_home_section','gym_rule','notification_template','member_profile_field','possible_member_field') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `metadata` json DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_content_items_content_type_is_active_idx` (`content_type`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_employee_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `employee_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_financial_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entry_type` enum('other_revenue','expense','deduction','advance','bonus','salary','employee_commission') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `entry_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` int DEFAULT NULL,
  `employee_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `payment_method` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'posted',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_financial_entries_entry_type_entry_date_idx` (`entry_type`,`entry_date`),
  KEY `club_financial_entries_branch_id_idx` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_free_benefits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `benefit_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `benefit_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `branch_id` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_inbody_bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) DEFAULT NULL,
  `slot_id` int DEFAULT NULL,
  `booking_date` varchar(10) NOT NULL,
  `start_time` varchar(8) DEFAULT NULL,
  `end_time` varchar(8) DEFAULT NULL,
  `staff_name` varchar(150) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'booked',
  `notes` text,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `club_inbody_bookings_member_id_idx` (`member_id`),
  KEY `club_inbody_bookings_booking_date_idx` (`booking_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `club_invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invitee_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invitee_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invitee_gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invited_by_id` int DEFAULT NULL,
  `invited_by_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visit_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
  `branch_id` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_invitations_status_idx` (`status`),
  KEY `club_invitations_branch_id_idx` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_leads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `follow_up_at` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_leads_branch_id_status_idx` (`branch_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_lookups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category` enum('class_genre','class_program','class_type','gym_section','expense_type','owner','nationality','region','visa_type','job_title','call_feedback','class_cancel_reason','membership_cancel_reason','gym_location','lost_category','machine_model','package_type','member_level','suit_size','member_goal','session_type','workout_type','maintenance_type','reservation_type','interest_percentage') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `metadata` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `club_lookups_category_name_key` (`category`,`name`),
  KEY `club_lookups_category_is_active_idx` (`category`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_lost_found` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_name` varchar(200) NOT NULL,
  `description` text,
  `staff_name` varchar(150) DEFAULT NULL,
  `found_date` varchar(20) NOT NULL,
  `found_time` varchar(20) DEFAULT NULL,
  `action_taken` text,
  `branch_id` int DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'stored',
  `delivered_to` varchar(150) DEFAULT NULL,
  `delivered_phone` varchar(30) DEFAULT NULL,
  `delivered_at` varchar(30) DEFAULT NULL,
  `delivered_note` text,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `club_lost_found_branch_id_idx` (`branch_id`),
  KEY `club_lost_found_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `club_machines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `serial_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_machines_branch_id_idx` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_machine_maintenance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `machine_id` int DEFAULT NULL,
  `machine_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `maintenance_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost` decimal(12,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `branch_id` int DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_machine_maintenance_maintenance_date_idx` (`maintenance_date`),
  KEY `club_machine_maintenance_machine_id_fkey` (`machine_id`),
  CONSTRAINT `club_machine_maintenance_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `club_machines` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_one_pass_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_reminders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reminder_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reminder_time` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_reminders_reminder_date_status_idx` (`reminder_date`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_sales_staff` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `club_sales_staff_branch_id_idx` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `club_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `end_time` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_type` enum('complaint','feedback','request') COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `priority` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `branch_id` int DEFAULT NULL,
  `staff_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_tickets_ticket_type_status_idx` (`ticket_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_training_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `trainer_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note_date` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `club_training_notes_member_id_idx` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_workouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workout_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trainer_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `member_id` int DEFAULT NULL,
  `member_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `workout_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `branch_id` int DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `one80_migration_history_archive` (
  `original_id` VARCHAR(36) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `finished_at` DATETIME(3) NULL,
  `migration_name` VARCHAR(255) NOT NULL,
  `logs` TEXT NULL,
  `rolled_back_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NOT NULL,
  `applied_steps_count` INT UNSIGNED NOT NULL,
  `backup_id` VARCHAR(255) NOT NULL,
  `archived_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`original_id`),
  INDEX `one80_migration_history_archive_name_idx` (`migration_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @add_club_classes_class_type = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_classes'
      AND COLUMN_NAME = 'class_type'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_classes\` ADD COLUMN \`class_type\` VARCHAR(50) NOT NULL DEFAULT ''class'''
);
PREPARE add_club_classes_class_type_stmt FROM @add_club_classes_class_type;
EXECUTE add_club_classes_class_type_stmt;
DEALLOCATE PREPARE add_club_classes_class_type_stmt;

SET @add_club_inbody_measurements_file_url = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_inbody_measurements'
      AND COLUMN_NAME = 'file_url'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_inbody_measurements\` ADD COLUMN \`file_url\` VARCHAR(255) NULL'
);
PREPARE add_club_inbody_measurements_file_url_stmt FROM @add_club_inbody_measurements_file_url;
EXECUTE add_club_inbody_measurements_file_url_stmt;
DEALLOCATE PREPARE add_club_inbody_measurements_file_url_stmt;

SET @add_club_inbody_measurements_staff_name = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_inbody_measurements'
      AND COLUMN_NAME = 'staff_name'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_inbody_measurements\` ADD COLUMN \`staff_name\` VARCHAR(150) NULL'
);
PREPARE add_club_inbody_measurements_staff_name_stmt FROM @add_club_inbody_measurements_staff_name;
EXECUTE add_club_inbody_measurements_staff_name_stmt;
DEALLOCATE PREPARE add_club_inbody_measurements_staff_name_stmt;

SET @add_club_members_emergency_name = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'emergency_name'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`emergency_name\` VARCHAR(150) NULL'
);
PREPARE add_club_members_emergency_name_stmt FROM @add_club_members_emergency_name;
EXECUTE add_club_members_emergency_name_stmt;
DEALLOCATE PREPARE add_club_members_emergency_name_stmt;

SET @add_club_members_emergency_phone = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'emergency_phone'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`emergency_phone\` VARCHAR(30) NULL'
);
PREPARE add_club_members_emergency_phone_stmt FROM @add_club_members_emergency_phone;
EXECUTE add_club_members_emergency_phone_stmt;
DEALLOCATE PREPARE add_club_members_emergency_phone_stmt;

SET @add_club_members_emergency_relation = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'emergency_relation'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`emergency_relation\` VARCHAR(80) NULL'
);
PREPARE add_club_members_emergency_relation_stmt FROM @add_club_members_emergency_relation;
EXECUTE add_club_members_emergency_relation_stmt;
DEALLOCATE PREPARE add_club_members_emergency_relation_stmt;

SET @add_club_members_sales_staff_id = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'sales_staff_id'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`sales_staff_id\` INT NULL'
);
PREPARE add_club_members_sales_staff_id_stmt FROM @add_club_members_sales_staff_id;
EXECUTE add_club_members_sales_staff_id_stmt;
DEALLOCATE PREPARE add_club_members_sales_staff_id_stmt;

SET @add_club_members_source_id = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'source_id'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`source_id\` INT NULL'
);
PREPARE add_club_members_source_id_stmt FROM @add_club_members_source_id;
EXECUTE add_club_members_source_id_stmt;
DEALLOCATE PREPARE add_club_members_source_id_stmt;

SET @add_club_members_trainer_id = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_members'
      AND COLUMN_NAME = 'trainer_id'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_members\` ADD COLUMN \`trainer_id\` INT NULL'
);
PREPARE add_club_members_trainer_id_stmt FROM @add_club_members_trainer_id;
EXECUTE add_club_members_trainer_id_stmt;
DEALLOCATE PREPARE add_club_members_trainer_id_stmt;

SET @add_club_spa_services_service_kind = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_spa_services'
      AND COLUMN_NAME = 'service_kind'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_spa_services\` ADD COLUMN \`service_kind\` VARCHAR(20) NOT NULL DEFAULT ''spa'''
);
PREPARE add_club_spa_services_service_kind_stmt FROM @add_club_spa_services_service_kind;
EXECUTE add_club_spa_services_service_kind_stmt;
DEALLOCATE PREPARE add_club_spa_services_service_kind_stmt;

SET @add_club_member_group_members_group_id_fkey = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_member_group_members'
      AND CONSTRAINT_NAME = 'club_member_group_members_group_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_member_group_members\` ADD CONSTRAINT \`club_member_group_members_group_id_fkey\` FOREIGN KEY (\`group_id\`) REFERENCES \`club_member_groups\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE'
);
PREPARE add_club_member_group_members_group_id_fkey_stmt FROM @add_club_member_group_members_group_id_fkey;
EXECUTE add_club_member_group_members_group_id_fkey_stmt;
DEALLOCATE PREPARE add_club_member_group_members_group_id_fkey_stmt;

SET @add_club_member_group_members_member_id_fkey = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_member_group_members'
      AND CONSTRAINT_NAME = 'club_member_group_members_member_id_fkey'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE \`club_member_group_members\` ADD CONSTRAINT \`club_member_group_members_member_id_fkey\` FOREIGN KEY (\`member_id\`) REFERENCES \`club_members\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE'
);
PREPARE add_club_member_group_members_member_id_fkey_stmt FROM @add_club_member_group_members_member_id_fkey;
EXECUTE add_club_member_group_members_member_id_fkey_stmt;
DEALLOCATE PREPARE add_club_member_group_members_member_id_fkey_stmt;
