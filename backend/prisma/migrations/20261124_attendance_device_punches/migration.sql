CREATE TABLE `attendance_device_punches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `device_id` INTEGER NOT NULL,
  `device_user_id` VARCHAR(32) NOT NULL,
  `punch_date` CHAR(10) NOT NULL,
  `punch_time` CHAR(8) NOT NULL,
  `device_state` SMALLINT NULL,
  `verify_type` SMALLINT NULL,
  `result` VARCHAR(20) NOT NULL,
  `message` VARCHAR(255) NULL,
  `attendance_id` INTEGER NULL,
  `received_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_device_punch`(`device_id`, `device_user_id`, `punch_date`, `punch_time`),
  INDEX `idx_device_punch_user_date`(`device_user_id`, `punch_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
