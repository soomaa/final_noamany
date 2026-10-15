-- Member-app "rate trainer" (ported from PHAROS 20260906120000_member_trainer_ratings), made to
-- coexist with ONE80's per-attendance private-session ratings.
--
-- DESIGN DECISION: PHAROS keeps ONE rating per (trainer_id, member_id): it de-duplicates the table
-- and adds UNIQUE (trainer_id, member_id). ONE80 must NOT do that: a member legitimately owns many
-- rows for one trainer, one per rated private attendance (`attendance_id` UNIQUE, added in
-- 20260909120000_one80_trainer_commission_integrity), and de-duplicating would delete them.
-- Instead the member-app rating is a separate kind of row:
--   * `app_member_id` is set (= member_id) ONLY on the member's single editable app rating;
--     per-attendance and staff-entered rows keep it NULL.
--   * UNIQUE (trainer_id, app_member_id) enforces one app rating per member per trainer. MySQL
--     treats every NULL as distinct inside a UNIQUE index, so existing rows are unaffected.
--   * All rows (app, attendance, staff) still feed `club_trainers.rating_avg`.
-- No row is deleted or rewritten; existing rows are not back-filled into `app_member_id`.
-- `club_trainer_availability` from the PHAROS migration already exists in ONE80
-- (20260909140000_one80_member_app_extras) and is not touched here.

-- `updated_at` for editable app ratings. Keeps a DB default so non-Prisma inserts still work;
-- rows that existed before this migration are back-filled to their own `created_at`.
SET @rating_updated_at_missing := (
  SELECT COUNT(*) = 0 FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_trainer_ratings'
    AND `COLUMN_NAME` = 'updated_at'
);
SET @rating_sql := IF(
  @rating_updated_at_missing,
  'ALTER TABLE `club_trainer_ratings` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `created_at`',
  'SELECT 1'
);
PREPARE rating_stmt FROM @rating_sql;
EXECUTE rating_stmt;
DEALLOCATE PREPARE rating_stmt;

SET @rating_sql := IF(
  @rating_updated_at_missing,
  'UPDATE `club_trainer_ratings` SET `updated_at` = `created_at`',
  'SELECT 1'
);
PREPARE rating_stmt FROM @rating_sql;
EXECUTE rating_stmt;
DEALLOCATE PREPARE rating_stmt;

-- Owner of the member-app rating (NULL for per-attendance and staff-entered rows).
SET @rating_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `club_trainer_ratings` ADD COLUMN `app_member_id` INTEGER NULL AFTER `member_id`',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_trainer_ratings'
    AND `COLUMN_NAME` = 'app_member_id'
);
PREPARE rating_stmt FROM @rating_sql;
EXECUTE rating_stmt;
DEALLOCATE PREPARE rating_stmt;

SET @rating_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE UNIQUE INDEX `uq_trainer_rating_app_member` ON `club_trainer_ratings` (`trainer_id`, `app_member_id`)',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_trainer_ratings'
    AND `INDEX_NAME` = 'uq_trainer_rating_app_member'
);
PREPARE rating_stmt FROM @rating_sql;
EXECUTE rating_stmt;
DEALLOCATE PREPARE rating_stmt;

-- Member-scoped lookups ("my ratings", member merge/delete) no longer scan by trainer.
SET @rating_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `club_trainer_ratings_member_id_idx` ON `club_trainer_ratings` (`member_id`)',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'club_trainer_ratings'
    AND `INDEX_NAME` = 'club_trainer_ratings_member_id_idx'
);
PREPARE rating_stmt FROM @rating_sql;
EXECUTE rating_stmt;
DEALLOCATE PREPARE rating_stmt;
