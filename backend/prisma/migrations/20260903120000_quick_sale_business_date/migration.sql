-- Business day for cafe reporting.
--
-- `sale_date` is the Cairo calendar date and rolls over at midnight, so a shift
-- running 07:00 -> 02:00 splits across two calendar days. Shift close aggregates
-- by `shift_session_id` and therefore keeps the whole night together, which made
-- the shift totals disagree with the cafe report totals.
--
-- `business_date` is the operating day the sale belongs to: the owning shift
-- session's `session_date`, falling back to `sale_date` for sales rung up with no
-- open session. Reports filter on this column so both screens agree.
ALTER TABLE `sales_quick_sales`
  ADD COLUMN `business_date` VARCHAR(10) NULL;

-- Backfill: adopt the owning shift session's business day.
UPDATE `sales_quick_sales` `s`
  JOIN `sales_shift_sessions` `ss` ON `ss`.`id` = `s`.`shift_session_id`
  SET `s`.`business_date` = `ss`.`session_date`
  WHERE `s`.`business_date` IS NULL;

-- Backfill: sales with no session keep their calendar date.
UPDATE `sales_quick_sales`
  SET `business_date` = `sale_date`
  WHERE `business_date` IS NULL;

CREATE INDEX `sales_quick_sales_business_date_idx`
  ON `sales_quick_sales` (`business_date`);
CREATE INDEX `sales_quick_sales_branch_business_date_status_idx`
  ON `sales_quick_sales` (`branch_id`, `business_date`, `status`);
