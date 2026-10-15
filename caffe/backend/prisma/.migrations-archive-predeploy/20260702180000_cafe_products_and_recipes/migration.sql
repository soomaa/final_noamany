CREATE TABLE `cafe_products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `category_id` INT NULL,
  `sell_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `image_url` VARCHAR(500) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cafe_products_product_code_key` (`product_code`),
  KEY `cafe_products_category_id_idx` (`category_id`),
  CONSTRAINT `cafe_products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `inv_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cafe_product_recipes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `ingredient_id` INT NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cafe_product_recipes_product_id_ingredient_id_key` (`product_id`, `ingredient_id`),
  KEY `cafe_product_recipes_product_id_idx` (`product_id`),
  KEY `cafe_product_recipes_ingredient_id_idx` (`ingredient_id`),
  CONSTRAINT `cafe_product_recipes_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `cafe_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cafe_product_recipes_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `inv_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
