-- Member group assignments (audit item 10)
CREATE TABLE IF NOT EXISTS `club_member_group_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `group_id` INT NOT NULL,
  `member_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `club_member_group_members_member_id_key` (`member_id`),
  INDEX `club_member_group_members_group_id_idx` (`group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
