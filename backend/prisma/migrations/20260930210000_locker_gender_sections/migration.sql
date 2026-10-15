ALTER TABLE `club_lockers`
  ADD COLUMN `section` VARCHAR(10) NOT NULL DEFAULT 'shared';

CREATE UNIQUE INDEX `uq_club_lockers_number_branch_section`
  ON `club_lockers` (`locker_number`, `main_branch_id`, `section`);

ALTER TABLE `club_gym_policies`
  ADD COLUMN `split_lockers_by_gender` BOOLEAN NOT NULL DEFAULT false;
