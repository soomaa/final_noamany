CREATE TABLE IF NOT EXISTS `private_file_metadata` (
  `id` CHAR(36) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `storage_key` VARCHAR(500) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `byte_size` BIGINT NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `owner_employee_id` INTEGER NULL,
  `branch_id` INTEGER NULL,
  `uploaded_by` INTEGER NOT NULL,
  `validation_status` VARCHAR(30) NOT NULL DEFAULT 'validated',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `retention_until` DATETIME(3) NULL,
  `deleted_at` DATETIME(3) NULL,
  `deleted_by` INTEGER NULL,

  UNIQUE INDEX `private_file_metadata_storage_key_key` (`storage_key`),
  INDEX `private_file_metadata_category_created_at_idx` (`category`, `created_at`),
  INDEX `private_file_metadata_owner_employee_id_deleted_at_idx` (`owner_employee_id`, `deleted_at`),
  INDEX `private_file_metadata_branch_id_deleted_at_idx` (`branch_id`, `deleted_at`),
  INDEX `private_file_metadata_uploaded_by_created_at_idx` (`uploaded_by`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
