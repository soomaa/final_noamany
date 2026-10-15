-- Café bundles / combos. A bundle groups café products sold together at one price.
-- "fixed" pricing charges the bundle price outright; "percent" sums the chosen
-- components' menu prices and applies a discount. Each group is a customer choice
-- (min_select..max_select); a fixed combo is a group with a single option.
-- Components still deduct their own recipes/stock when the bundle is sold.

CREATE TABLE `cafe_bundles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `bundle_code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` VARCHAR(500) NULL,
  `image_url` VARCHAR(500) NULL,
  `pricing_mode` VARCHAR(20) NOT NULL DEFAULT 'fixed',
  `fixed_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `discount_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cafe_bundles_bundle_code_key`(`bundle_code`),
  INDEX `cafe_bundles_is_active_idx`(`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cafe_bundle_groups` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `bundle_id` INTEGER NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `min_select` INTEGER NOT NULL DEFAULT 1,
  `max_select` INTEGER NOT NULL DEFAULT 1,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `cafe_bundle_groups_bundle_id_sort_order_idx`(`bundle_id`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cafe_bundle_group_options` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `group_id` INTEGER NOT NULL,
  `cafe_product_id` INTEGER NOT NULL,
  `cafe_variant_id` INTEGER NULL,
  `price_delta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `cafe_bundle_group_options_group_id_sort_order_idx`(`group_id`, `sort_order`),
  INDEX `cafe_bundle_group_options_cafe_product_id_idx`(`cafe_product_id`),
  INDEX `cafe_bundle_group_options_cafe_variant_id_idx`(`cafe_variant_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Sale line can now represent a bundle: item_type = 'bundle', bundle_id points at
-- the bundle, and bundle_selection is a JSON snapshot of the chosen components
-- (product/variant/price/cost) so receipts, reprints and edits stay faithful.
ALTER TABLE `sales_quick_sale_items`
  ADD COLUMN `bundle_id` INTEGER NULL,
  ADD COLUMN `bundle_selection` JSON NULL;

CREATE INDEX `sales_quick_sale_items_bundle_id_idx` ON `sales_quick_sale_items`(`bundle_id`);

ALTER TABLE `cafe_bundle_groups`
  ADD CONSTRAINT `cafe_bundle_groups_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `cafe_bundles`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cafe_bundle_group_options`
  ADD CONSTRAINT `cafe_bundle_group_options_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `cafe_bundle_groups`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cafe_bundle_group_options`
  ADD CONSTRAINT `cafe_bundle_group_options_cafe_product_id_fkey` FOREIGN KEY (`cafe_product_id`) REFERENCES `cafe_products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cafe_bundle_group_options`
  ADD CONSTRAINT `cafe_bundle_group_options_cafe_variant_id_fkey` FOREIGN KEY (`cafe_variant_id`) REFERENCES `cafe_product_variants`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
