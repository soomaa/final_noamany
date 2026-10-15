ALTER TABLE `job_request_orders`
  ADD COLUMN `pipeline_status` VARCHAR(32) NOT NULL DEFAULT 'applied',
  ADD COLUMN `status_reason` TEXT NULL,
  ADD COLUMN `status_changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `accepted_at` DATETIME(3) NULL,
  ADD COLUMN `accepted_by` INT NULL,
  ADD COLUMN `converted_employee_id` INT NULL,
  ADD COLUMN `converted_at` DATETIME(3) NULL;

CREATE INDEX `idx_job_request_orders_pipeline_status`
  ON `job_request_orders` (`pipeline_status`, `status_changed_at`);

CREATE UNIQUE INDEX `uq_job_request_orders_converted_employee`
  ON `job_request_orders` (`converted_employee_id`);

-- Infer the furthest trustworthy legacy stage without claiming offer acceptance.
UPDATE `job_request_orders`
SET `pipeline_status` = CASE
  WHEN `do_interview` = 1 THEN 'interviewed'
  WHEN `determine_interview` = 1 THEN 'interview_scheduled'
  ELSE 'applied'
END;
