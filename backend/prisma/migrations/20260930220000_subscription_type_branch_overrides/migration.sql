ALTER TABLE `club_subscription_types`
  ADD COLUMN `source_subscription_type_id` INTEGER NULL;

CREATE UNIQUE INDEX `uq_subscription_type_branch_override`
  ON `club_subscription_types`(`source_subscription_type_id`, `branch_id`);

CREATE INDEX `club_subscription_types_source_subscription_type_id_idx`
  ON `club_subscription_types`(`source_subscription_type_id`);

ALTER TABLE `club_subscription_types`
  ADD CONSTRAINT `club_subscription_types_source_subscription_type_id_fkey`
  FOREIGN KEY (`source_subscription_type_id`) REFERENCES `club_subscription_types`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;
