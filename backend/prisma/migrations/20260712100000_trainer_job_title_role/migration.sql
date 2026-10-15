-- Mark a job title (المسمى الوظيفي) as a gym trainer role. Employees holding a trainer job title
-- are auto-synced into club_trainers so they appear in the class trainer picker.
ALTER TABLE `department_jobs`
  ADD COLUMN `is_trainer` BOOLEAN NOT NULL DEFAULT false;

-- club_trainers.employee_id becomes 1:1 (unique). MySQL allows multiple NULLs, so unlinked
-- trainers are unaffected. Replaces the plain index with a unique one.
ALTER TABLE `club_trainers` DROP INDEX `club_trainers_employee_id_idx`;
ALTER TABLE `club_trainers` ADD UNIQUE INDEX `club_trainers_employee_id_key` (`employee_id`);
