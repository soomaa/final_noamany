ALTER TABLE `prc_purchase_returns` ADD COLUMN `supplier_invoice_id` INTEGER NULL;
CREATE INDEX `prc_purchase_returns_supplier_invoice_id_idx` ON `prc_purchase_returns` (`supplier_invoice_id`);
ALTER TABLE `prc_supplier_invoices`
  ADD COLUMN `returned_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN `is_opening_balance` BOOLEAN NOT NULL DEFAULT false;
