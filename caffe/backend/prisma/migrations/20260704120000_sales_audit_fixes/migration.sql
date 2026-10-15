-- Audit items 73-84: booking services catalog, sales employee link
CREATE TABLE IF NOT EXISTS `sales_booking_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `name_en` VARCHAR(100) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `branch_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `sales_booking_services_branch_id_idx`(`branch_id`),
    INDEX `sales_booking_services_is_active_idx`(`is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sales_bookings`
    ADD COLUMN `service_id` INTEGER NULL,
    ADD COLUMN `sales_employee_id` INTEGER NULL;

CREATE INDEX `sales_bookings_service_id_idx` ON `sales_bookings`(`service_id`);
CREATE INDEX `sales_bookings_sales_employee_id_idx` ON `sales_bookings`(`sales_employee_id`);

ALTER TABLE `sales_bookings`
    ADD CONSTRAINT `sales_bookings_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `sales_booking_services`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
