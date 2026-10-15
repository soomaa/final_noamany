-- Invitations issued against a member's package now record which subscription paid for
-- them, so the included-invitations allowance is counted per subscription: a renewal
-- starts a fresh allowance instead of inheriting the member's whole invitation history.
-- Legacy rows stay NULL and are never charged against a package.
ALTER TABLE `am_invitations`
  ADD COLUMN `subscription_id` INT NULL;

CREATE INDEX `am_invitations_subscription_id_idx` ON `am_invitations`(`subscription_id`);
