-- Applied previously on this database as 20260707120000_subscription_type_form_fields.
-- Kept locally so Prisma migration history matches the DB record.
ALTER TABLE `club_subscription_types`
  ADD COLUMN `is_part_of_target` BOOLEAN NOT NULL DEFAULT false AFTER `days`,
  ADD COLUMN `invitations_count` INT NULL AFTER `is_part_of_target`,
  ADD COLUMN `inbody_count` INT NULL AFTER `invitations_count`,
  ADD COLUMN `notify_customers` BOOLEAN NOT NULL DEFAULT false AFTER `show_in_app`,
  ADD COLUMN `notify_on_expiry` BOOLEAN NOT NULL DEFAULT false AFTER `notify_customers`;
