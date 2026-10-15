CREATE TABLE IF NOT EXISTS `document_number_series` (
  `series_key` VARCHAR(80) NOT NULL,
  `next_value` BIGINT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`series_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
