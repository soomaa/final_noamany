-- Add an explicit inventory movement type for cafe products manufactured for internal use.
-- Product type and unit codes are stored as varchar fields, so existing rows require no rewrite.
ALTER TABLE `inv_transactions`
  MODIFY `txn_type` ENUM('receipt','issue','transfer','count','damage','manufacturing','purchase_return','sales_return','adjustment') NOT NULL;

ALTER TABLE `inv_movements`
  MODIFY `txn_type` ENUM('receipt','issue','transfer','count','damage','manufacturing','purchase_return','sales_return','adjustment') NOT NULL;
