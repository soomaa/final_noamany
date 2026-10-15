-- House hospitality (ضيافة المكان): a sale disposition that is NOT charged to any
-- person. The guest's order is recorded, stock is deducted, and its cost is booked as
-- a hospitality operating expense against the venue — never onto a partner/employee
-- statement. These columns capture the optional "directed by / beneficiary" tag, used
-- for reporting only (no receivable is ever created from them).
ALTER TABLE `sales_quick_sales`
  ADD COLUMN `hospitality_host_kind` VARCHAR(20) NULL,
  ADD COLUMN `hospitality_host_id` INTEGER NULL,
  ADD COLUMN `hospitality_host_name` VARCHAR(150) NULL;
