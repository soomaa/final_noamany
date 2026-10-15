-- Additive POS payment metadata. Existing sales and payment rows remain unchanged.
ALTER TABLE `sales_pos_payment_methods`
  ADD COLUMN `requires_reference` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `sales_pos_payments`
  ADD COLUMN `catalog_payment_method_id` INT NULL,
  ADD COLUMN `method_code` VARCHAR(40) NULL,
  ADD COLUMN `method_name` VARCHAR(100) NULL,
  ADD INDEX `sales_pos_payments_catalog_payment_method_id_idx` (`catalog_payment_method_id`),
  ADD INDEX `sales_pos_payments_method_code_idx` (`method_code`),
  ADD CONSTRAINT `sales_pos_payments_catalog_payment_method_id_fkey`
    FOREIGN KEY (`catalog_payment_method_id`) REFERENCES `sales_pos_payment_methods` (`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;
