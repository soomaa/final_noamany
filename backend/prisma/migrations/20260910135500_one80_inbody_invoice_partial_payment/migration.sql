-- AlterTable
ALTER TABLE `club_inbody_invoices` ADD COLUMN `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `remaining_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0;
