-- Member-app home sections ("الفئات") and package tagging, ported from PHAROS in its FINAL shape.
-- Folds the PHAROS chain 20260917120000_package_app_categories, 20260919120000_drop_general_gym_category,
-- 20260919140000_split_therapy_and_nutrition, 20260920100000_add_kids_category and
-- 20260924150000_dynamic_package_categories into one step. ONE80 never had the intermediate ENUM,
-- so the tag column is created directly as VARCHAR holding a `club_package_categories.key`.
-- Additive only: creates two tables, seeds the default sections, adds one nullable column.

CREATE TABLE IF NOT EXISTS `club_package_categories` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `key`        VARCHAR(60)  NOT NULL,
  `name`       VARCHAR(100) NOT NULL,
  `name_en`    VARCHAR(100) NULL,
  `icon`       VARCHAR(500) NULL,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `is_active`  BOOLEAN      NOT NULL DEFAULT true,
  `is_system`  BOOLEAN      NOT NULL DEFAULT false,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `club_package_categories_key_key` (`key`),
  INDEX `club_package_categories_is_active_sort_order_idx` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The nine default sections, in their original order. `icon` stays NULL so the app keeps its
-- bundled artwork until an admin uploads a replacement. INSERT IGNORE never overwrites admin edits.
-- `is_system` sections (offers / private / classes) are filled by the server and cannot be deleted.
INSERT IGNORE INTO `club_package_categories` (`key`, `name`, `name_en`, `sort_order`, `is_system`) VALUES
  ('men_gym',       'جيم رجالي',     'Men’s gym',     10, false),
  ('women_gym',     'جيم حريمي',     'Women’s gym',   20, false),
  ('combat',        'ألعاب قتالية',  'Combat sports', 30, false),
  ('offers',        'عروض',          'Offers',        40, true),
  ('private',       'برايفت',        'Private',       50, true),
  ('classes',       'حصص',           'Classes',       60, true),
  ('physiotherapy', 'علاج طبيعي',    'Physiotherapy', 70, false),
  ('nutrition',     'تغذية',         'Nutrition',     80, false),
  ('kids',          'أطفال',         'Kids',          90, false);

-- Which sections a package appears under (many-to-many). `category` = club_package_categories.key
-- (FK-by-convention, as in PHAROS, so keys stay plain strings the app can match on).
CREATE TABLE IF NOT EXISTS `club_subscription_type_categories` (
  `subscription_type_id` INT         NOT NULL,
  `category`             VARCHAR(60) NOT NULL,
  `created_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`subscription_type_id`, `category`),
  INDEX `club_subscription_type_categories_category_idx` (`category`),
  CONSTRAINT `club_subscription_type_categories_subscription_type_id_fkey`
    FOREIGN KEY (`subscription_type_id`)
    REFERENCES `club_subscription_types` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Per-package notes shown to members in the app (NULL hides the block).
SET @category_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_subscription_types` ADD COLUMN `app_notes` TEXT NULL',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_subscription_types'
    AND `COLUMN_NAME` = 'app_notes'
);
PREPARE category_stmt FROM @category_sql;
EXECUTE category_stmt;
DEALLOCATE PREPARE category_stmt;
