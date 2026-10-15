-- Portable schema-only migration. A host must explicitly classify legacy leave types;
-- this reference never guesses policy from a row id or local convention.
SET @hr_is_paid_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'holiday_setting'
    AND `COLUMN_NAME` = 'is_paid'
);
SET @hr_add_is_paid = IF(
  @hr_is_paid_exists = 0,
  'ALTER TABLE `holiday_setting` ADD COLUMN `is_paid` BOOLEAN NOT NULL DEFAULT TRUE',
  'SELECT 1'
);
PREPARE hr_leave_policy_statement FROM @hr_add_is_paid;
EXECUTE hr_leave_policy_statement;
DEALLOCATE PREPARE hr_leave_policy_statement;
