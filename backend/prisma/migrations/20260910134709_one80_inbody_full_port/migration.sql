-- AlterTable
ALTER TABLE `club_inbody_measurements` ADD COLUMN `branch_id` INTEGER NULL,
    ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `entitlement_id` INTEGER NULL,
    ADD COLUMN `invoice_id` INTEGER NULL,
    ADD COLUMN `settlement_source` VARCHAR(30) NOT NULL DEFAULT 'legacy',
    ADD COLUMN `subscription_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `club_inbody_services` ADD COLUMN `measurement_count` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `validity_days` INTEGER NULL;

-- AlterTable
ALTER TABLE `club_receipts` ADD COLUMN `service_debt_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `club_inbody_branch_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `allow_without_active_membership` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_inbody_branch_settings_branch_id_key`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_inbody_entitlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `invoice_id` INTEGER NOT NULL,
    `total_count` INTEGER NOT NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `purchased_date` VARCHAR(10) NOT NULL,
    `expires_at` VARCHAR(10) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_inbody_entitlements_invoice_id_key`(`invoice_id`),
    INDEX `club_inbody_entitlements_member_id_expires_at_idx`(`member_id`, `expires_at`),
    INDEX `club_inbody_entitlements_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_service_debts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `debt_number` VARCHAR(40) NOT NULL,
    `source_type` VARCHAR(30) NOT NULL,
    `source_ref` VARCHAR(50) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NOT NULL,
    `customer_phone` VARCHAR(50) NULL,
    `description` VARCHAR(500) NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remaining_amount` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'outstanding',
    `transaction_date` VARCHAR(10) NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_service_debts_debt_number_key`(`debt_number`),
    INDEX `club_service_debts_member_id_remaining_amount_idx`(`member_id`, `remaining_amount`),
    INDEX `club_service_debts_branch_id_remaining_amount_idx`(`branch_id`, `remaining_amount`),
    INDEX `club_service_debts_customer_phone_idx`(`customer_phone`),
    INDEX `club_service_debts_source_type_source_ref_idx`(`source_type`, `source_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `club_inbody_measurements_branch_id_idx` ON `club_inbody_measurements`(`branch_id`);

-- CreateIndex
CREATE INDEX `club_inbody_measurements_subscription_id_idx` ON `club_inbody_measurements`(`subscription_id`);

-- CreateIndex
CREATE INDEX `club_inbody_measurements_entitlement_id_idx` ON `club_inbody_measurements`(`entitlement_id`);

-- CreateIndex
CREATE INDEX `club_inbody_measurements_invoice_id_idx` ON `club_inbody_measurements`(`invoice_id`);

-- CreateIndex
CREATE INDEX `club_inbody_services_branch_id_idx` ON `club_inbody_services`(`branch_id`);

-- CreateIndex
CREATE INDEX `club_receipts_service_debt_id_idx` ON `club_receipts`(`service_debt_id`);

-- AddForeignKey
ALTER TABLE `club_receipts` ADD CONSTRAINT `club_receipts_service_debt_id_fkey` FOREIGN KEY (`service_debt_id`) REFERENCES `club_service_debts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_service_debts` ADD CONSTRAINT `club_service_debts_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
