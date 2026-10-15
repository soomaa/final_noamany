-- Multiple daily entries policy: allow a member to check in more than once per day.
-- Configured per subscription TYPE (package) and snapshotted onto each new subscription.
ALTER TABLE `club_subscription_types`
  ADD COLUMN `allow_multiple_daily_entries` BOOLEAN NOT NULL DEFAULT false AFTER `sessions_count`;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `allow_multiple_daily_entries` BOOLEAN NOT NULL DEFAULT false AFTER `sessions_used`;
