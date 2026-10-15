-- Older employee rows sometimes kept only the display name of the job title.
-- Restore the canonical department_jobs id so RBAC and trainer synchronization work.
UPDATE `employees` AS e
SET e.`mosma_wazefy_code` = (
  SELECT MIN(j.`id`)
  FROM `department_jobs` AS j
  WHERE TRIM(j.`name`) = TRIM(e.`mosma_wazefy_n`)
)
WHERE e.`mosma_wazefy_code` IS NULL
  AND NULLIF(TRIM(e.`mosma_wazefy_n`), '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `department_jobs` AS j
    WHERE TRIM(j.`name`) = TRIM(e.`mosma_wazefy_n`)
  );

-- Keep the fitness trainer roster aligned with active HR employees after the backfill.
INSERT INTO `club_trainers` (
  `employee_id`,
  `name`,
  `email`,
  `phone`,
  `is_active`,
  `is_deleted`,
  `created_at`,
  `updated_at`
)
SELECT
  e.`id`,
  COALESCE(NULLIF(TRIM(e.`employee`), ''), CONCAT('موظف #', e.`id`)),
  e.`email`,
  e.`phone`,
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `employees` AS e
JOIN `department_jobs` AS j ON j.`id` = e.`mosma_wazefy_code`
WHERE j.`is_trainer` = true
  AND COALESCE(e.`leave_emp`, 0) = 0
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `email` = COALESCE(VALUES(`email`), `club_trainers`.`email`),
  `phone` = COALESCE(VALUES(`phone`), `club_trainers`.`phone`),
  `is_active` = true,
  `is_deleted` = false,
  `updated_at` = CURRENT_TIMESTAMP;
