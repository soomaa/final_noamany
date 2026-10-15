-- Session package pricing matrix: price for buying 1..N sessions of a type.
CREATE TABLE IF NOT EXISTS `club_subscription_type_session_prices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_type_id` INT NOT NULL,
  `sessions_count` INT NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_sub_type_session_price` (`subscription_type_id`, `sessions_count`),
  INDEX `club_subscription_type_session_prices_subscription_type_id_idx` (`subscription_type_id`),
  CONSTRAINT `club_subscription_type_session_prices_subscription_type_id_fkey`
    FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
