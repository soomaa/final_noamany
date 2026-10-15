-- Additive indexes for the highest-frequency HR joins and balance/report filters.
-- No uniqueness is asserted because employee codes are legacy business identifiers.
CREATE INDEX `employees_emp_code_idx` ON `employees` (`emp_code`);
CREATE INDEX `contract_employe_emp_code_idx` ON `contract_employe` (`emp_code`);
CREATE INDEX `hr_agz_emp_year_status_idx`
  ON `hr_all_agzat_orders` (`emp_code_fk`, `year`, `suspend`, `f2a_agaza`);
CREATE INDEX `hr_agz_emp_date_range_idx`
  ON `hr_all_agzat_orders` (`emp_code_fk`, `agaza_from_date_m`, `agaza_to_date_m`);
CREATE INDEX `hr_agz_assignee_status_idx`
  ON `hr_all_agzat_orders` (`current_to_user_id`, `suspend`);
