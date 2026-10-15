ALTER TABLE `sales_shifts`
  ADD COLUMN `is_last_shift_of_day` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `sales_shifts_branch_id_is_last_shift_of_day_idx`
  ON `sales_shifts`(`branch_id`, `is_last_shift_of_day`);
