-- Restore Noamany invoice reporting without guessing or rewriting historical data.
-- The guards also support databases that already received these nullable columns.
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'gender'), 'SELECT 1', 'ALTER TABLE `sales_quick_sales` ADD COLUMN `gender` ENUM(''male'', ''female'') NULL');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'cafe_category_id'), 'SELECT 1', 'ALTER TABLE `sales_quick_sales` ADD COLUMN `cafe_category_id` INTEGER NULL');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'cafe_category_id' AND SEQ_IN_INDEX = 1), 'SELECT 1', 'CREATE INDEX `sales_quick_sales_cafe_category_id_idx` ON `sales_quick_sales` (`cafe_category_id`)');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'cafe_category_id' AND REFERENCED_TABLE_NAME = 'inv_categories' AND REFERENCED_COLUMN_NAME = 'id'), 'SELECT 1', 'ALTER TABLE `sales_quick_sales` ADD CONSTRAINT `sales_quick_sales_cafe_category_id_fkey` FOREIGN KEY (`cafe_category_id`) REFERENCES `inv_categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
