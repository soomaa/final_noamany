ALTER TABLE `club_gym_policies`
  ADD COLUMN `restrict_employee_financial_visibility` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `users`
  ADD COLUMN `dashboard_shortcuts` JSON NULL;
