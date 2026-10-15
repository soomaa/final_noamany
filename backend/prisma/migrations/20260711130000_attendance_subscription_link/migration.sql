-- Per-subscription check-in: record which subscription a check-in was for
-- (a member with e.g. a monthly + a Zumba-sessions subscription can check in on each).
ALTER TABLE `club_attendance`
  ADD COLUMN `subscription_id` INT NULL AFTER `member_name`,
  ADD COLUMN `subscription_type` VARCHAR(150) NULL AFTER `subscription_id`,
  ADD INDEX `club_attendance_subscription_id_idx` (`subscription_id`);
