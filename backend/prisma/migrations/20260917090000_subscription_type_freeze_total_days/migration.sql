-- Total days a package may stay frozen across all of its freezes (NULL = unlimited).
-- Complements the existing `freeze_days`, which caps how many TIMES it may be frozen.
ALTER TABLE `club_subscription_types`
  ADD COLUMN `freeze_total_days` INT NULL AFTER `freeze_days`;

-- Member-app visibility is no longer a per-package switch: the app already lists every
-- active package for the branch, so align the stored flag with that behaviour.
UPDATE `club_subscription_types` SET `show_in_app` = 1 WHERE `is_active` = 1;
