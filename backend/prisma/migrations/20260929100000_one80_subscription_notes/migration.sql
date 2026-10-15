-- Free-text staff note on any subscription (e.g. why it was changed or what was agreed).
-- Ported from PHAROS 20260929100000_subscription_notes. Existing rows stay NULL (no note).
SET @notes_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_subscriptions` ADD COLUMN `notes` TEXT NULL',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_subscriptions'
    AND `COLUMN_NAME` = 'notes'
);
PREPARE notes_stmt FROM @notes_sql;
EXECUTE notes_stmt;
DEALLOCATE PREPARE notes_stmt;
