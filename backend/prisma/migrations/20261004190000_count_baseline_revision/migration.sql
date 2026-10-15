-- NULL retains legacy counts without inventing a historical revision.
-- New counts/recounts store 0 when no prior count movement exists.
ALTER TABLE `inv_count_items`
  ADD COLUMN `baseline_count_movement_id` INTEGER NULL;

-- Preserve the requested amount as well as its six-decimal stock components.
ALTER TABLE `cafe_waste_records`
  MODIFY COLUMN `quantity` DECIMAL(18, 6) NOT NULL;

-- Stock document lines must retain the same quantities as their ledger movements.
ALTER TABLE `inv_transaction_items`
  MODIFY COLUMN `quantity` DECIMAL(18, 6) NOT NULL;
ALTER TABLE `inv_opening_stocks`
  MODIFY COLUMN `quantity` DECIMAL(18, 6) NOT NULL;
