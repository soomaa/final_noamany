-- Link HR employees to mobile-app accounts (api_users)
ALTER TABLE `employees`
  ADD COLUMN `app_user_id` INT NULL AFTER `basic_salary`,
  ADD INDEX `employees_app_user_id_idx` (`app_user_id`),
  ADD CONSTRAINT `employees_app_user_id_fk`
    FOREIGN KEY (`app_user_id`) REFERENCES `api_users` (`user_id`)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
