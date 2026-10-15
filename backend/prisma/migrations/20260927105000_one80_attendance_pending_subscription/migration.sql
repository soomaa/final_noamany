-- A gate entry by a member with several usable subscriptions is recorded at once and flagged
-- until reception picks the subscription it counts against. Ported from PHAROS
-- 20260924090000_attendance_pending_subscription. Existing rows default to false (already resolved).
SET @pending_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_attendance` ADD COLUMN `pending_subscription_choice` BOOLEAN NOT NULL DEFAULT false',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_attendance'
    AND `COLUMN_NAME` = 'pending_subscription_choice'
);
PREPARE pending_stmt FROM @pending_sql;
EXECUTE pending_stmt;
DEALLOCATE PREPARE pending_stmt;

SET @pending_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `club_attendance_pending_subscription_choice_branch_id_idx` ON `club_attendance` (`pending_subscription_choice`, `branch_id`)',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_attendance'
    AND `INDEX_NAME` = 'club_attendance_pending_subscription_choice_branch_id_idx'
);
PREPARE pending_stmt FROM @pending_sql;
EXECUTE pending_stmt;
DEALLOCATE PREPARE pending_stmt;
