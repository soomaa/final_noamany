-- Keep existing invitations intact while enforcing the one-visit phone policy for new writes.
ALTER TABLE `am_invitations`
  ADD COLUMN `recipient_phone_unique_key` VARCHAR(50) NULL,
  ADD UNIQUE INDEX `uq_am_invitation_phone_once` (`recipient_phone_unique_key`);

ALTER TABLE `club_gym_policies`
  ADD COLUMN `allow_same_guest_multiple_invitations` BOOLEAN NOT NULL DEFAULT false;
