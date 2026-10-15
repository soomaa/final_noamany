-- Preserve the actual subscription payment channel instead of collapsing wallet,
-- Visa and transfers into legacy generic values.
ALTER TABLE `club_subscriptions`
  MODIFY COLUMN `payment_method` ENUM('cash','card','bank','online','visa','transfer','wallet','instapay') NULL;

ALTER TABLE `club_receipts`
  MODIFY COLUMN `payment_method` ENUM('cash','card','bank','online','visa','transfer','wallet','instapay') NULL;

ALTER TABLE `club_locker_subscriptions`
  MODIFY COLUMN `payment_method` ENUM('cash','card','bank','online','visa','transfer','wallet','instapay') NULL;

ALTER TABLE `club_event_payments`
  MODIFY COLUMN `payment_method` ENUM('cash','card','bank','online','visa','transfer','wallet','instapay') NULL;
