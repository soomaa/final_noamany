-- Additive ONE80 café update; never removes or rewrites business data.
SET @allowance_ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sales_quick_sales` ADD COLUMN `employee_benefit_date` VARCHAR(10) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'employee_benefit_date');
PREPARE allowance_stmt FROM @allowance_ddl;
EXECUTE allowance_stmt;
DEALLOCATE PREPARE allowance_stmt;
SET @allowance_ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sales_quick_sales` ADD COLUMN `employee_free_drinks` INT NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND COLUMN_NAME = 'employee_free_drinks');
PREPARE allowance_stmt FROM @allowance_ddl;
EXECUTE allowance_stmt;
DEALLOCATE PREPARE allowance_stmt;
SET @allowance_ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sales_quick_sale_items` ADD COLUMN `free_quantity` INT NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sale_items' AND COLUMN_NAME = 'free_quantity');
PREPARE allowance_stmt FROM @allowance_ddl;
EXECUTE allowance_stmt;
DEALLOCATE PREPARE allowance_stmt;
SET @allowance_ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX idx_employee_daily_drinks ON sales_quick_sales(employee_id, employee_benefit_date, status)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND INDEX_NAME = 'idx_employee_daily_drinks');
PREPARE allowance_stmt FROM @allowance_ddl;
EXECUTE allowance_stmt;
DEALLOCATE PREPARE allowance_stmt;
