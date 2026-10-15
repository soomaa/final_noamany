CREATE TABLE `cafe_product_categories` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `category_id` INTEGER NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `cafe_product_categories_product_id_category_id_key`(`product_id`, `category_id`),
  INDEX `cafe_product_categories_product_id_sort_order_idx`(`product_id`, `sort_order`),
  INDEX `cafe_product_categories_category_id_idx`(`category_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `cafe_product_categories` (`product_id`, `category_id`, `sort_order`)
SELECT `id`, `category_id`, 0
FROM `cafe_products`
WHERE `category_id` IS NOT NULL;

ALTER TABLE `cafe_product_categories`
  ADD CONSTRAINT `cafe_product_categories_product_id_fkey`
  FOREIGN KEY (`product_id`) REFERENCES `cafe_products`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cafe_product_categories`
  ADD CONSTRAINT `cafe_product_categories_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `inv_categories`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
