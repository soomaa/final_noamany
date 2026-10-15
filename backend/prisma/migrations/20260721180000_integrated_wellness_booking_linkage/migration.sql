-- Subscription benefits must be consumed transactionally and remain auditable on the invoice.
ALTER TABLE `club_subscriptions`
  ADD COLUMN `inbody_used` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `spa_used` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `club_inbody_invoices`
  ADD COLUMN `payment_method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NULL,
  ADD COLUMN `subscription_id` INTEGER NULL,
  ADD COLUMN `covered_by_subscription` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `created_by` INTEGER NULL,
  ADD INDEX `club_inbody_invoices_service_id_idx` (`service_id`),
  ADD INDEX `club_inbody_invoices_subscription_id_idx` (`subscription_id`),
  ADD CONSTRAINT `club_inbody_invoices_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `club_inbody_services`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_inbody_invoices_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_spa_invoices`
  ADD COLUMN `payment_method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NULL,
  ADD COLUMN `subscription_id` INTEGER NULL,
  ADD COLUMN `covered_by_subscription` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `created_by` INTEGER NULL,
  ADD INDEX `club_spa_invoices_subscription_id_idx` (`subscription_id`),
  ADD CONSTRAINT `club_spa_invoices_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A booking is paid only through auditable payment rows; partial payments/refunds are first-class.
ALTER TABLE `sales_bookings`
  ADD COLUMN `paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `refunded_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `payment_method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NULL,
  ADD COLUMN `paid_at` DATETIME(3) NULL;

UPDATE `sales_bookings`
SET `paid_amount` = `final_amount`, `payment_method` = 'cash', `paid_at` = `updated_at`
WHERE `payment_status` = 'paid' AND `final_amount` > 0;

CREATE TABLE `sales_booking_payments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payment_number` VARCHAR(50) NOT NULL,
  `booking_id` INTEGER NOT NULL,
  `kind` VARCHAR(20) NOT NULL DEFAULT 'payment',
  `amount` DECIMAL(10,2) NOT NULL,
  `method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NOT NULL,
  `payment_date` VARCHAR(10) NOT NULL,
  `notes` VARCHAR(500) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'posted',
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `sales_booking_payments_payment_number_key` (`payment_number`),
  INDEX `sales_booking_payments_booking_id_idx` (`booking_id`),
  INDEX `sales_booking_payments_payment_date_idx` (`payment_date`),
  INDEX `sales_booking_payments_kind_idx` (`kind`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_booking_payments_booking_id_fkey`
    FOREIGN KEY (`booking_id`) REFERENCES `sales_bookings`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_trainer_earning_payments`
  ADD COLUMN `period_from` VARCHAR(10) NULL,
  ADD COLUMN `period_to` VARCHAR(10) NULL,
  ADD INDEX `club_trainer_earning_payments_period_from_period_to_idx` (`period_from`, `period_to`);

-- Remove only the known placeholder wellness catalog rows, and only while unreferenced.
DELETE s FROM `club_inbody_services` s
LEFT JOIN `club_inbody_invoices` i ON i.`service_id` = s.`id`
WHERE i.`id` IS NULL
  AND s.`name` IN ('قياس InBody أساسي', 'قياس InBody متقدم', 'تقرير InBody مع استشارة', 'تقرير InBody + استشارة');

DELETE s FROM `club_spa_services` s
LEFT JOIN `club_spa_invoices` i ON i.`service_id` = s.`id`
LEFT JOIN `club_spa_bookings` b ON b.`service_id` = s.`id`
WHERE i.`id` IS NULL AND b.`id` IS NULL
  AND s.`name` IN ('مساج سويدي', 'ساونا', 'حمام بخار', 'جلسة استرخاء', 'جاكوزي');
