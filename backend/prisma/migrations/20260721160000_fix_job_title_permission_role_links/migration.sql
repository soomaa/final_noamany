-- Each job title must be backed by the exact role edited in the RBAC matrix.
-- Previously trainer employees were assigned to a hidden shared `trainer` role,
-- which made revoking access on the visible job-title role ineffective.
INSERT INTO `rbac_roles` (`key`, `name_ar`, `name_en`, `description`, `is_system`, `is_super_admin`, `created_at`, `updated_at`)
SELECT
  CONCAT('job_title_', job.`id`),
  job.`name`,
  job.`name`,
  CONCAT('صلاحيات المسمى الوظيفي: ', job.`name`),
  TRUE,
  FALSE,
  NOW(),
  NOW()
FROM `department_jobs` job
ON DUPLICATE KEY UPDATE
  `name_ar` = VALUES(`name_ar`),
  `name_en` = VALUES(`name_en`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = NOW();

-- Job-title access is intentionally one-to-one: remove stale/shared assignments,
-- then assign the role whose matrix is actually shown to the administrator.
DELETE assignment
FROM `rbac_user_roles` assignment
INNER JOIN `users` app_user ON app_user.`user_id` = assignment.`user_id`
INNER JOIN `employees` employee ON employee.`id` = app_user.`emp_code`
WHERE employee.`mosma_wazefy_code` IS NOT NULL;

INSERT INTO `rbac_user_roles` (`user_id`, `role_id`, `expires_at`, `created_at`, `created_by`)
SELECT app_user.`user_id`, role.`id`, NULL, NOW(), NULL
FROM `users` app_user
INNER JOIN `employees` employee ON employee.`id` = app_user.`emp_code`
INNER JOIN `rbac_roles` role ON role.`key` = CONCAT('job_title_', employee.`mosma_wazefy_code`)
WHERE employee.`mosma_wazefy_code` IS NOT NULL
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`), `expires_at` = NULL;

UPDATE `users` app_user
INNER JOIN `employees` employee ON employee.`id` = app_user.`emp_code`
INNER JOIN `rbac_roles` role ON role.`key` = CONCAT('job_title_', employee.`mosma_wazefy_code`)
SET app_user.`role_id_fk` = role.`id`
WHERE employee.`mosma_wazefy_code` IS NOT NULL;
