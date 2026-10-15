-- Flexible expense types (أنواع المصروفات). fin_expenses.category stays free text; this table
-- drives the picker so admins can add/edit types (rent/electricity/water/…) without a code change.
CREATE TABLE IF NOT EXISTS `fin_expense_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `fin_expense_categories_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the default expense types (كهرباء + مياه split out of the old generic "مرافق").
INSERT IGNORE INTO `fin_expense_categories` (`name`, `sort_order`, `is_system`) VALUES
  ('رواتب', 10, false),
  ('إيجار', 20, false),
  ('كهرباء', 30, false),
  ('مياه', 40, false),
  ('صيانة', 50, false),
  ('تسويق', 60, false),
  ('مشتريات', 70, false),
  ('نقل وشحن', 80, false),
  ('ضرائب ورسوم', 90, false),
  ('تأمينات', 100, false),
  ('قرطاسية', 110, false),
  ('اتصالات', 120, false),
  ('ضيافة', 130, false),
  ('تدريب', 140, false),
  ('مردودات اشتراكات الجيم', 900, true),
  ('أخرى', 1000, false);

-- updated_at has no default (Prisma @updatedAt is app-side); the seed INSERT above omits it, so
-- stamp it here to avoid a zero-datetime that Prisma refuses to read.
UPDATE `fin_expense_categories` SET `updated_at` = `created_at` WHERE `updated_at` < '1970-01-01';
