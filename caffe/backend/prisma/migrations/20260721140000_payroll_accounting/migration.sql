ALTER TABLE `hr_mosayer`
  ADD COLUMN `egmali_tamin_hesa_oner` DECIMAL(19, 2) NULL AFTER `egmali_khasm_tamen`;

ALTER TABLE `hr_mosayer_details`
  ADD COLUMN `tamin_hesa_oner` DECIMAL(19, 2) NULL AFTER `khasm_tamen`;
