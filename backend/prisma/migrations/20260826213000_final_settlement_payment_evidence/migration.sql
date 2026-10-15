ALTER TABLE `hr_final_settlements`
  ADD COLUMN `bank_reference` VARCHAR(150) NULL,
  ADD COLUMN `payment_snapshot` JSON NULL;
