ALTER TABLE `club_trainer_schedule_slots`
  ADD COLUMN `class_type_id` INTEGER NULL AFTER `id`;

ALTER TABLE `club_trainer_schedule_slots`
  DROP INDEX `uq_trainer_weekly_slot`;

INSERT INTO `club_trainer_schedule_slots` (
  `class_type_id`,
  `trainer_id`,
  `weekday`,
  `start_time`,
  `end_time`,
  `branch_id`,
  `hall_id`,
  `max_capacity`,
  `is_active`,
  `created_at`,
  `updated_at`
)
SELECT
  ctt.`class_type_id`,
  s.`trainer_id`,
  s.`weekday`,
  s.`start_time`,
  s.`end_time`,
  s.`branch_id`,
  s.`hall_id`,
  s.`max_capacity`,
  s.`is_active`,
  s.`created_at`,
  s.`updated_at`
FROM `club_trainer_schedule_slots` s
JOIN `club_class_type_trainers` ctt
  ON ctt.`trainer_id` = s.`trainer_id`
WHERE s.`class_type_id` IS NULL
  AND ctt.`class_type_id` <> (
    SELECT MIN(ctt2.`class_type_id`)
    FROM `club_class_type_trainers` ctt2
    WHERE ctt2.`trainer_id` = s.`trainer_id`
  );

UPDATE `club_trainer_schedule_slots` s
SET s.`class_type_id` = (
  SELECT MIN(ctt.`class_type_id`)
  FROM `club_class_type_trainers` ctt
  WHERE ctt.`trainer_id` = s.`trainer_id`
)
WHERE s.`class_type_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `club_class_type_trainers` ctt
    WHERE ctt.`trainer_id` = s.`trainer_id`
  );

DELETE FROM `club_trainer_schedule_slots`
WHERE `class_type_id` IS NULL;

ALTER TABLE `club_trainer_schedule_slots`
  MODIFY `class_type_id` INTEGER NOT NULL,
  ADD UNIQUE INDEX `uq_class_trainer_weekly_slot` (`class_type_id`, `trainer_id`, `weekday`, `start_time`, `branch_id`),
  ADD INDEX `club_trainer_schedule_slots_class_type_id_weekday_idx` (`class_type_id`, `weekday`),
  ADD CONSTRAINT `club_trainer_schedule_slots_class_type_id_fkey`
    FOREIGN KEY (`class_type_id`) REFERENCES `club_class_types` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION;
