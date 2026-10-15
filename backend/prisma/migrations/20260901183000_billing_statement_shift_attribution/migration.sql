-- Attribute employee/partner account settlements to the shift that collected them.
-- Existing statements stay unlinked; no historical sale ownership is changed.
ALTER TABLE `sales_billing_statements`
  ADD COLUMN `shift_session_id` INT NULL,
  ADD INDEX `sales_billing_statements_shift_session_id_idx` (`shift_session_id`),
  ADD CONSTRAINT `sales_billing_statements_shift_session_id_fkey`
    FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions` (`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
