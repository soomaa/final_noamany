-- Reception can combine branch, gender and today's attendance on every request.
-- Add covering indexes idempotently so large live datasets do not turn the filter into table scans.
SET @has_member_gender_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'club_members'
    AND index_name = 'idx_club_members_gender_branch_visibility'
);
SET @add_member_gender_index_sql = IF(
  @has_member_gender_index = 0,
  'ALTER TABLE `club_members` ADD INDEX `idx_club_members_gender_branch_visibility` (`gender`, `branch_id`, `is_deleted`, `is_active`)',
  'SELECT 1'
);
PREPARE add_member_gender_index_stmt FROM @add_member_gender_index_sql;
EXECUTE add_member_gender_index_stmt;
DEALLOCATE PREPARE add_member_gender_index_stmt;

SET @has_attendance_filter_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'club_attendance'
    AND index_name = 'idx_club_attendance_branch_date_member'
);
SET @add_attendance_filter_index_sql = IF(
  @has_attendance_filter_index = 0,
  'ALTER TABLE `club_attendance` ADD INDEX `idx_club_attendance_branch_date_member` (`branch_id`, `attendance_date`, `member_id`)',
  'SELECT 1'
);
PREPARE add_attendance_filter_index_stmt FROM @add_attendance_filter_index_sql;
EXECUTE add_attendance_filter_index_stmt;
DEALLOCATE PREPARE add_attendance_filter_index_stmt;

SET @has_subscription_gender_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'club_subscriptions'
    AND index_name = 'idx_club_subscriptions_gender_branch_status'
);
SET @add_subscription_gender_index_sql = IF(
  @has_subscription_gender_index = 0,
  'ALTER TABLE `club_subscriptions` ADD INDEX `idx_club_subscriptions_gender_branch_status` (`gender`, `branch_id`, `status`)',
  'SELECT 1'
);
PREPARE add_subscription_gender_index_stmt FROM @add_subscription_gender_index_sql;
EXECUTE add_subscription_gender_index_stmt;
DEALLOCATE PREPARE add_subscription_gender_index_stmt;
