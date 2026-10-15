-- Stock quantities were stored with 3 decimals while café recipes consume e.g. 7.5 g of a
-- kg-tracked ingredient (0.0075 kg): the balance and the movement row rounded independently,
-- so a sale followed by its cancellation could drift by a gram. Widen to 6 decimals so the
-- smallest recipe quantity is stored exactly (widening only; no data is changed).
ALTER TABLE `inv_stock_balances`   MODIFY `current_stock`    DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE `inv_product_branches` MODIFY `stock_quantity`   DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE `inv_movements`        MODIFY `quantity`         DECIMAL(18,6) NOT NULL,
                                   MODIFY `balance_after`    DECIMAL(18,6) NOT NULL;
ALTER TABLE `inv_count_items`      MODIFY `system_quantity`  DECIMAL(18,6) NOT NULL DEFAULT 0,
                                   MODIFY `counted_quantity` DECIMAL(18,6) NOT NULL DEFAULT 0,
                                   MODIFY `variance`         DECIMAL(18,6) NOT NULL DEFAULT 0;

-- POS idempotency: one id per logical sale attempt. A retry after a lost response returns the
-- saved invoice instead of creating a second one.
ALTER TABLE `sales_quick_sales` ADD COLUMN `client_request_id` VARCHAR(64) NULL AFTER `warehouse_id`;
CREATE UNIQUE INDEX `uq_quick_sale_client_request` ON `sales_quick_sales` (`client_request_id`);
