-- Audience (men / women / kids / mixed) per weekly schedule slot, ported from PHAROS
-- 20260818130000_class_schedule_audience. `club_classes.audience` already exists in ONE80
-- (20260709110000_class_audience_member_notifications); generated sessions can now inherit it
-- from their slot. Existing slots default to 'mixed', which is how they behave today.
SET @audience_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_trainer_schedule_slots` ADD COLUMN `audience` ENUM(''men'', ''women'', ''kids'', ''mixed'') NOT NULL DEFAULT ''mixed'' AFTER `max_capacity`',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_trainer_schedule_slots'
    AND `COLUMN_NAME` = 'audience'
);
PREPARE audience_stmt FROM @audience_sql;
EXECUTE audience_stmt;
DEALLOCATE PREPARE audience_stmt;

SET @audience_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_class_schedule_slots` ADD COLUMN `audience` ENUM(''men'', ''women'', ''kids'', ''mixed'') NOT NULL DEFAULT ''mixed'' AFTER `price`',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_class_schedule_slots'
    AND `COLUMN_NAME` = 'audience'
);
PREPARE audience_stmt FROM @audience_sql;
EXECUTE audience_stmt;
DEALLOCATE PREPARE audience_stmt;
