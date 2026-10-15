-- Attribute every subscription payment to the user who recorded it. This is intentionally
-- a convention-only users.user_id reference, matching the legacy schema's other created_by fields.
ALTER TABLE `club_receipts`
  ADD COLUMN `created_by` INTEGER NULL;

UPDATE `club_receipts` AS `r`
INNER JOIN `club_subscriptions` AS `s` ON `s`.`id` = `r`.`subscription_id`
SET `r`.`created_by` = `s`.`created_by`
WHERE `r`.`created_by` IS NULL;

CREATE INDEX `club_receipts_created_by_receipt_date_idx`
  ON `club_receipts` (`created_by`, `receipt_date`);
