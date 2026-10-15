-- Split tender for club receipts: one collection can mix methods (e.g. cash + bank transfer).
CREATE TABLE `club_receipt_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet', 'instapay') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_receipt_payments_receipt_id_idx`(`receipt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_receipt_payments` ADD CONSTRAINT `club_receipt_payments_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `club_receipts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Backfill one row per existing receipt so treasury/report reads never lose historical money
-- once they switch from the receipt header method to this breakdown.
INSERT INTO `club_receipt_payments` (`receipt_id`, `method`, `amount`, `created_at`)
SELECT `id`, COALESCE(`payment_method`, 'cash'), `amount`, `created_at`
FROM `club_receipts`
WHERE `amount` > 0;
