ALTER TABLE `club_gym_policies`
  ADD COLUMN `allow_refunds` BOOLEAN NOT NULL DEFAULT false AFTER `outstanding_alert_after_subscription_pct`;

UPDATE `club_gym_policies` SET `allow_refunds` = false WHERE `id` = 1;
