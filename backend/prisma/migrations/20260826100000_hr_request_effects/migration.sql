CREATE TABLE IF NOT EXISTS `hr_request_effects` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `request_id` INTEGER NOT NULL,
  `effect_type` VARCHAR(30) NOT NULL,
  `employee_id` INTEGER NOT NULL,
  `snapshot_json` JSON NOT NULL,
  `result_json` JSON NOT NULL,
  `applied_by` INTEGER NOT NULL,
  `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `hr_request_effects_request_id_key` (`request_id`),
  INDEX `hr_request_effects_employee_id_applied_at_idx` (`employee_id`, `applied_at`),
  INDEX `hr_request_effects_effect_type_applied_at_idx` (`effect_type`, `applied_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
