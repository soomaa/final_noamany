-- Reception hands a physical locker to a member at check-in. An open row
-- (released_at IS NULL) is the person holding the key right now.
CREATE TABLE `club_locker_handoffs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `locker_id` INT NOT NULL,
  `member_id` INT NOT NULL,
  `branch_id` INT NOT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `released_at` DATETIME(3) NULL,
  `assigned_by` INT NULL,
  `released_by` INT NULL,
  INDEX `club_locker_handoffs_locker_id_released_at_idx` (`locker_id`, `released_at`),
  INDEX `club_locker_handoffs_member_id_released_at_idx` (`member_id`, `released_at`),
  INDEX `club_locker_handoffs_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_locker_handoffs_locker_id_fkey` FOREIGN KEY (`locker_id`) REFERENCES `club_lockers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `club_locker_handoffs_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A guest invitation from reception spends one included invitation on the member's
-- subscription and creates a potential-customer lead.
CREATE TABLE `club_guest_invitations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_id` INT NOT NULL,
  `member_id` INT NOT NULL,
  `guest_name` VARCHAR(200) NOT NULL,
  `guest_phone` VARCHAR(50) NOT NULL,
  `guest_phone_unique_key` VARCHAR(50) NULL,
  `guest_age` INT NULL,
  `lead_id` INT NULL,
  `branch_id` INT NOT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_guest_invitation_phone_once` (`guest_phone_unique_key`),
  INDEX `club_guest_invitations_subscription_id_idx` (`subscription_id`),
  INDEX `club_guest_invitations_member_id_idx` (`member_id`),
  INDEX `club_guest_invitations_guest_phone_idx` (`guest_phone`),
  INDEX `club_guest_invitations_branch_id_idx` (`branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
