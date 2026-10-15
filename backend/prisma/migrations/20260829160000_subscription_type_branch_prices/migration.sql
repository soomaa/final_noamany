CREATE TABLE `club_subscription_type_branch_prices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_type_id` INT NOT NULL,
  `branch_id` INT NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_sub_type_branch_price` (`subscription_type_id`, `branch_id`),
  INDEX `club_subscription_type_branch_prices_branch_id_idx` (`branch_id`),
  CONSTRAINT `club_subscription_type_branch_prices_subscription_type_id_fkey`
    FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
