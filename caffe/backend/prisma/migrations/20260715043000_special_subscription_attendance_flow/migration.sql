ALTER TABLE `club_class_types`
  ADD COLUMN `subscription_sessions_count` INTEGER NOT NULL DEFAULT 1 AFTER `single_session_price`,
  ADD COLUMN `subscription_validity_days` INTEGER NOT NULL DEFAULT 30 AFTER `subscription_sessions_count`;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `special_class_type_id` INTEGER NULL AFTER `subscription_type_id`,
  ADD INDEX `club_subscriptions_special_class_type_id_idx` (`special_class_type_id`),
  ADD CONSTRAINT `club_subscriptions_special_class_type_id_fkey`
    FOREIGN KEY (`special_class_type_id`) REFERENCES `club_class_types` (`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;
