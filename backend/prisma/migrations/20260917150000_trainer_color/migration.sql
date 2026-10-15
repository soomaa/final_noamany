-- Reception shows the captain of the scheduled class as a coloured chip; the colour belongs to
-- the trainer so the same captain reads the same everywhere. NULL falls back to a derived colour.
ALTER TABLE `club_trainers`
  ADD COLUMN `color` VARCHAR(7) NULL AFTER `specialization`;
