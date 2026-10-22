ALTER TABLE `inv_transactions`
  ADD COLUMN `recipient_name` VARCHAR(200) NULL,
  ADD COLUMN `cafe_category_id` INTEGER NULL,
  ADD COLUMN `gender` ENUM('male', 'female') NULL;
