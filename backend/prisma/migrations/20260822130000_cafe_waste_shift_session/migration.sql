-- Additive, nullable link: existing waste records remain unchanged and valid.
ALTER TABLE `cafe_waste_records`
  ADD COLUMN `shift_session_id` INT NULL;

CREATE INDEX `cafe_waste_records_shift_session_id_created_at_idx`
  ON `cafe_waste_records`(`shift_session_id`, `created_at`);

ALTER TABLE `cafe_waste_records`
  ADD CONSTRAINT `cafe_waste_records_shift_session_id_fkey`
  FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;
