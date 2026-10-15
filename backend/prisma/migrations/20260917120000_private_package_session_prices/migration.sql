-- Private session packages get the same per-session-count price matrix the regular session
-- packages already have, so selling 3 of a 10-session private package prices correctly.
CREATE TABLE `club_private_package_session_prices` (
  `id`             INT NOT NULL AUTO_INCREMENT,
  `package_id`     INT NOT NULL,
  `sessions_count` INT NOT NULL,
  `price`          DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_private_package_session_price`(`package_id`, `sessions_count`),
  INDEX `club_private_package_session_prices_package_id_idx`(`package_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_private_package_session_prices`
  ADD CONSTRAINT `club_private_package_session_prices_package_id_fkey`
  FOREIGN KEY (`package_id`) REFERENCES `club_private_packages`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;
