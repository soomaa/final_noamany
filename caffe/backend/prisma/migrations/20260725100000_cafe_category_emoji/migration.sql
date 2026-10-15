ALTER TABLE `inv_categories`
  ADD COLUMN `emoji` VARCHAR(32) NOT NULL DEFAULT '🍽️' AFTER `name_en`;
