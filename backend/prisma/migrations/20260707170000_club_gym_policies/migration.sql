CREATE TABLE `club_gym_policies` (
  `id` INT NOT NULL DEFAULT 1,
  `allow_checkin_with_outstanding` BOOLEAN NOT NULL DEFAULT false,
  `outstanding_alert_enabled` BOOLEAN NOT NULL DEFAULT true,
  `outstanding_alert_after_subscription_pct` INT NOT NULL DEFAULT 50,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updated_by` INT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `club_gym_policies` (
  `id`,
  `allow_checkin_with_outstanding`,
  `outstanding_alert_enabled`,
  `outstanding_alert_after_subscription_pct`
) VALUES (1, false, true, 50);
