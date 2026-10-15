-- Quick sale / walk-in services catalog for reception (حصة فردية، كارنيه، …).
CREATE TABLE `club_quick_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `branch_id` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `club_quick_services_is_active_sort_order_idx`(`is_active`, `sort_order`),
    INDEX `club_quick_services_branch_id_idx`(`branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `club_quick_services` (`name`, `description`, `price`, `sort_order`, `is_active`, `created_at`, `updated_at`)
VALUES
  ('حصة فردية', 'دخول لمرة واحدة بدون اشتراك', 100.00, 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('كارنيه / رسوم إدارية', 'رسوم كارنيه أو إدارية سريعة', 50.00, 20, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
