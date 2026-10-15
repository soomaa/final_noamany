-- Public-facing branch profile shown in the member app and the guest browser, ported from PHAROS
-- 20260917150000_club_branch_profiles + 20260917170000_branch_profile_english_name (folded).
-- Separate from tbl_branches so the legacy operational row stays untouched; one row per branch,
-- created lazily the first time an admin saves the form. `branch_id` = tbl_branches.branch_id
-- (FK-by-convention, as in PHAROS).
CREATE TABLE IF NOT EXISTS `club_branch_profiles` (
  `branch_id`       INT          NOT NULL,
  `display_name`    VARCHAR(120) NULL,
  `display_name_en` VARCHAR(120) NULL,
  `tagline`         VARCHAR(160) NULL,
  `about`           TEXT         NULL,
  `address`         VARCHAR(255) NULL,
  `phone`           VARCHAR(30)  NULL,
  `whatsapp`        VARCHAR(30)  NULL,
  `email`           VARCHAR(120) NULL,
  `map_url`         VARCHAR(500) NULL,
  `cover_image`     VARCHAR(500) NULL,
  `gallery`         JSON         NULL,
  `working_hours`   JSON         NULL,
  `facebook_url`    VARCHAR(500) NULL,
  `instagram_url`   VARCHAR(500) NULL,
  `is_published`    TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`      INT          NOT NULL DEFAULT 0,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3)  NOT NULL,

  PRIMARY KEY (`branch_id`),
  INDEX `club_branch_profiles_is_published_sort_order_idx` (`is_published`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Safety net for a database that already got the PHAROS table without the English name.
SET @branch_profile_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_branch_profiles` ADD COLUMN `display_name_en` VARCHAR(120) NULL AFTER `display_name`',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_branch_profiles'
    AND `COLUMN_NAME` = 'display_name_en'
);
PREPARE branch_profile_stmt FROM @branch_profile_sql;
EXECUTE branch_profile_stmt;
DEALLOCATE PREPARE branch_profile_stmt;
