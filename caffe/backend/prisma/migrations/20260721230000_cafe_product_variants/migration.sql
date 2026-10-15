CREATE TABLE `cafe_product_variants` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `variant_code` VARCHAR(60) NULL,
  `sell_price` DECIMAL(12, 2) NOT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `cafe_product_variants_product_id_name_key`(`product_id`, `name`),
  UNIQUE INDEX `cafe_product_variants_product_id_variant_code_key`(`product_id`, `variant_code`),
  INDEX `cafe_product_variants_product_id_is_active_sort_order_idx`(`product_id`, `is_active`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cafe_variant_recipes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `variant_id` INTEGER NOT NULL,
  `ingredient_id` INTEGER NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,

  UNIQUE INDEX `cafe_variant_recipes_variant_id_ingredient_id_key`(`variant_id`, `ingredient_id`),
  INDEX `cafe_variant_recipes_variant_id_idx`(`variant_id`),
  INDEX `cafe_variant_recipes_ingredient_id_idx`(`ingredient_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sales_quick_sale_items`
  ADD COLUMN `cafe_variant_id` INTEGER NULL,
  ADD COLUMN `variant_name` VARCHAR(120) NULL,
  ADD INDEX `sales_quick_sale_items_cafe_variant_id_idx`(`cafe_variant_id`);

ALTER TABLE `cafe_product_variants`
  ADD CONSTRAINT `cafe_product_variants_product_id_fkey`
  FOREIGN KEY (`product_id`) REFERENCES `cafe_products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cafe_variant_recipes`
  ADD CONSTRAINT `cafe_variant_recipes_variant_id_fkey`
  FOREIGN KEY (`variant_id`) REFERENCES `cafe_product_variants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `cafe_variant_recipes_ingredient_id_fkey`
  FOREIGN KEY (`ingredient_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `sales_quick_sale_items`
  ADD CONSTRAINT `sales_quick_sale_items_cafe_variant_id_fkey`
  FOREIGN KEY (`cafe_variant_id`) REFERENCES `cafe_product_variants`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
