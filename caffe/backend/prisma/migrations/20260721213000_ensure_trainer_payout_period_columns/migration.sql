-- The original linkage migration was edited after it had already been applied on
-- some installations. Keep this repair migration idempotent so both upgraded and
-- freshly-created databases end up with the same trainer payout period columns.

SET @add_period_from = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_trainer_earning_payments'
      AND COLUMN_NAME = 'period_from'
  ),
  'SELECT 1',
  'ALTER TABLE `club_trainer_earning_payments` ADD COLUMN `period_from` VARCHAR(10) NULL'
);
PREPARE add_period_from_stmt FROM @add_period_from;
EXECUTE add_period_from_stmt;
DEALLOCATE PREPARE add_period_from_stmt;

SET @add_period_to = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_trainer_earning_payments'
      AND COLUMN_NAME = 'period_to'
  ),
  'SELECT 1',
  'ALTER TABLE `club_trainer_earning_payments` ADD COLUMN `period_to` VARCHAR(10) NULL'
);
PREPARE add_period_to_stmt FROM @add_period_to;
EXECUTE add_period_to_stmt;
DEALLOCATE PREPARE add_period_to_stmt;

SET @add_period_index = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'club_trainer_earning_payments'
      AND INDEX_NAME = 'club_trainer_earning_payments_period_from_period_to_idx'
  ),
  'SELECT 1',
  'ALTER TABLE `club_trainer_earning_payments` ADD INDEX `club_trainer_earning_payments_period_from_period_to_idx` (`period_from`, `period_to`)'
);
PREPARE add_period_index_stmt FROM @add_period_index;
EXECUTE add_period_index_stmt;
DEALLOCATE PREPARE add_period_index_stmt;
