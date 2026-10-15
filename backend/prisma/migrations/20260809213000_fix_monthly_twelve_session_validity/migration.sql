-- Repair the PHAROS incident where "12 sessions" was also stored as a 12-day
-- calendar validity. Session count and calendar validity are independent.

-- First repair recent affected member snapshots. The snapshot itself is the
-- source of truth here so legacy rows whose package link is missing or whose
-- package was manually corrected are repaired too. Exhausted and frozen
-- subscriptions are deliberately left untouched.
UPDATE `club_subscriptions` AS s
SET
  s.`subscription_end_date` = DATE_FORMAT(
    DATE_ADD(STR_TO_DATE(s.`subscription_start_date`, '%Y-%m-%d'), INTERVAL 30 DAY),
    '%Y-%m-%d'
  ),
  s.`status` = CASE
    WHEN CURDATE() < STR_TO_DATE(s.`subscription_start_date`, '%Y-%m-%d') THEN 'upcoming'
    WHEN CURDATE() <= DATE_ADD(STR_TO_DATE(s.`subscription_start_date`, '%Y-%m-%d'), INTERVAL 30 DAY)
      THEN 'active'
    ELSE 'expired'
  END
WHERE s.`is_linked_to_sessions` = 1
  AND s.`sessions_count` = 12
  AND s.`sessions_used` < s.`sessions_count`
  AND s.`status` <> 'frozen'
  AND s.`subscription_end_date` >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 30 DAY), '%Y-%m-%d')
  AND DATEDIFF(
    STR_TO_DATE(s.`subscription_end_date`, '%Y-%m-%d'),
    STR_TO_DATE(s.`subscription_start_date`, '%Y-%m-%d')
  ) = 12;

-- Future enrollments use a monthly calendar window. Longer configured
-- validities (for example 60 days) remain unchanged.
UPDATE `club_subscription_types`
SET `days` = 30
WHERE `is_linked_to_sessions` = 1
  AND `sessions_count` = 12
  AND `days` = 12;
