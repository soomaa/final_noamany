-- Make paid/unpaid leave an explicit policy instead of relying on legacy type id 17.
ALTER TABLE `holiday_setting`
  ADD COLUMN `is_paid` BOOLEAN NOT NULL DEFAULT TRUE;

-- Preserve the existing production meaning of legacy leave type 17.
UPDATE `holiday_setting`
SET `is_paid` = FALSE
WHERE `id` = 17;
