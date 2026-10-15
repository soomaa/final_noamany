-- SwatGym's standard gym packages include InBody scans by duration:
-- 3 months = 1, 6 months = 2, 12 months = 3.  Only fill previously
-- unconfigured regular packages; never overwrite explicit business values,
-- session packages, or special offers.
UPDATE `club_subscription_types`
SET `inbody_count` = CASE
  WHEN `days` >= 360 THEN 3
  WHEN `days` >= 180 THEN 2
  WHEN `days` >= 90 THEN 1
  ELSE 0
END
WHERE `inbody_count` IS NULL
  AND `is_special_offer` = 0
  AND `is_linked_to_sessions` = 0;
