ALTER TABLE `inv_categories`
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

-- Keep the current display order stable for existing categories on upgrade.
SET @category_sort_order := -1;
UPDATE `inv_categories`
SET `sort_order` = (@category_sort_order := @category_sort_order + 1)
ORDER BY `id` DESC;

CREATE INDEX `inv_categories_sort_order_idx` ON `inv_categories`(`sort_order`);
