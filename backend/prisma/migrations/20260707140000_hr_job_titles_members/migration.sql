-- HR: employment type for Sales/Trainer employees
ALTER TABLE `employees` ADD COLUMN `employment_type` VARCHAR(20) NULL AFTER `employee_type`;

-- Club members: index for sales filtering by creator
CREATE INDEX `idx_club_members_created_by` ON `club_members` (`created_by`);
