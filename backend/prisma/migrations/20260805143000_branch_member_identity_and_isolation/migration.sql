ALTER TABLE `club_members`
  DROP INDEX `uq_club_member_phone`,
  ADD UNIQUE INDEX `uq_club_member_branch_phone` (`branch_id`, `phone`);
