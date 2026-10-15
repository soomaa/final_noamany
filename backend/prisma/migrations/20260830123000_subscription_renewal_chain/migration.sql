ALTER TABLE `club_subscriptions`
  ADD COLUMN `renewed_from_subscription_id` INT NULL;

CREATE UNIQUE INDEX `club_subscriptions_renewed_from_subscription_id_key`
  ON `club_subscriptions` (`renewed_from_subscription_id`);

ALTER TABLE `club_subscriptions`
  ADD CONSTRAINT `club_subscriptions_renewed_from_subscription_id_fkey`
  FOREIGN KEY (`renewed_from_subscription_id`) REFERENCES `club_subscriptions` (`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;
