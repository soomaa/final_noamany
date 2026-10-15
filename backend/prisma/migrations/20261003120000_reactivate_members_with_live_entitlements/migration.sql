-- Repair the denormalized member activity flag when at least one real entitlement is live.
-- Explicitly blocked/deleted members are excluded. The backup table preserves every changed row.
CREATE TABLE IF NOT EXISTS `legacy_member_activity_backup_20261003` (
  `id` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL,
  `is_blocked` TINYINT(1) NOT NULL,
  `start_date` VARCHAR(10) NULL,
  `end_date` VARCHAR(10) NULL,
  `updated_at` DATETIME(3) NULL,
  `backed_up_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

INSERT IGNORE INTO `legacy_member_activity_backup_20261003`
  (`id`, `is_active`, `is_blocked`, `start_date`, `end_date`, `updated_at`)
SELECT m.`id`, m.`is_active`, COALESCE(m.`is_blocked`, 0),
       m.`start_date`, m.`end_date`, m.`updated_at`
FROM `club_members` m
WHERE m.`is_deleted` = 0
  AND m.`is_active` = 0
  AND COALESCE(m.`is_blocked`, 0) = 0
  AND EXISTS (
    SELECT 1
    FROM `club_subscriptions` s
    WHERE s.`member_id` = m.`id`
      AND s.`status` NOT IN ('frozen', 'expired')
      AND s.`subscription_start_date` <= CURDATE()
      AND s.`subscription_end_date` >= CURDATE()
      AND (
        s.`is_linked_to_sessions` = 0
        OR s.`sessions_count` IS NULL
        OR s.`sessions_used` < s.`sessions_count`
      )
  );

UPDATE `club_members` m
SET m.`is_active` = 1,
    m.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE m.`is_deleted` = 0
  AND m.`is_active` = 0
  AND COALESCE(m.`is_blocked`, 0) = 0
  AND EXISTS (
    SELECT 1
    FROM `club_subscriptions` s
    WHERE s.`member_id` = m.`id`
      AND s.`status` NOT IN ('frozen', 'expired')
      AND s.`subscription_start_date` <= CURDATE()
      AND s.`subscription_end_date` >= CURDATE()
      AND (
        s.`is_linked_to_sessions` = 0
        OR s.`sessions_count` IS NULL
        OR s.`sessions_used` < s.`sessions_count`
      )
  );
