ALTER TABLE `club_gym_policies`
  ADD COLUMN `require_expense_approval` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `print_subscription_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_subscription_payments` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_quick_service_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_inbody_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_spa_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_locker_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `print_event_receipts` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `receipt_paper_size` VARCHAR(12) NOT NULL DEFAULT 'thermal',
  ADD COLUMN `receipt_a4_copies` INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN `receipt_language` VARCHAR(5) NOT NULL DEFAULT 'ar';
