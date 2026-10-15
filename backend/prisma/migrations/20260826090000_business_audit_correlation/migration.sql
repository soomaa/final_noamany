ALTER TABLE `business_audit_log`
  ADD COLUMN `correlation_id` VARCHAR(64) NULL;

CREATE INDEX `business_audit_log_correlation_id_idx`
  ON `business_audit_log`(`correlation_id`);
