-- Audit fixes: trainer ratings, inbody catalog, survey responses, workout trainer link, inbody height, locker freeze

CREATE TABLE IF NOT EXISTS `club_trainer_ratings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `trainer_id` INT NOT NULL,
  `member_id` INT NULL,
  `rating` DECIMAL(3, 2) NOT NULL,
  `comment` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `club_trainer_ratings_trainer_id_idx` (`trainer_id`),
  CONSTRAINT `club_trainer_ratings_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_inbody_services` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `branch_id` INT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_survey_responses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `survey_id` INT NOT NULL,
  `member_id` INT NULL,
  `answers_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `club_survey_responses_survey_id_idx` (`survey_id`),
  CONSTRAINT `club_survey_responses_survey_id_fkey` FOREIGN KEY (`survey_id`) REFERENCES `club_surveys`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_inbody_measurements`
  ADD COLUMN `height_cm` DECIMAL(5, 2) NULL AFTER `weight`;

ALTER TABLE `club_workout_programs`
  ADD COLUMN `trainer_id` INT NULL AFTER `member_id`;

CREATE INDEX `club_workout_programs_trainer_id_idx` ON `club_workout_programs`(`trainer_id`);

ALTER TABLE `club_locker_subscriptions`
  ADD COLUMN `freeze_start_date` VARCHAR(10) NULL AFTER `status`;
