-- Member mobile API: invitation phone + inviter, InBody report attachment
ALTER TABLE `am_invitations`
  MODIFY `recipient_email` VARCHAR(255) NULL,
  ADD COLUMN `recipient_phone` VARCHAR(50) NULL AFTER `recipient_email`,
  ADD COLUMN `inviter_member_id` INT NULL AFTER `recipient_phone`,
  ADD INDEX `am_invitations_inviter_member_id_idx` (`inviter_member_id`);

ALTER TABLE `club_inbody_measurements`
  ADD COLUMN `report_url` VARCHAR(500) NULL AFTER `notes`;
