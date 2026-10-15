ALTER TABLE `club_subscription_types`
  ADD COLUMN `apply_to_all_branches` BOOLEAN NOT NULL DEFAULT false AFTER `branch_id`;

CREATE TABLE `club_subscription_type_branches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_type_id` INT NOT NULL,
  `branch_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_sub_type_branch` (`subscription_type_id`, `branch_id`),
  INDEX `club_subscription_type_branches_branch_id_idx` (`branch_id`),
  CONSTRAINT `club_subscription_type_branches_subscription_type_id_fkey`
    FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `club_subscription_type_branches` (`subscription_type_id`, `branch_id`)
SELECT `id`, `branch_id`
FROM `club_subscription_types`
WHERE `branch_id` IS NOT NULL;

UPDATE `club_subscription_types`
SET `apply_to_all_branches` = true
WHERE `branch_id` IS NULL;
