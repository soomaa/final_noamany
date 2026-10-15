-- Speed finance creator scoping (non-admin locked to own rows / GL entries).
-- MySQL does not support CREATE INDEX IF NOT EXISTS on this server — use INFORMATION_SCHEMA.

SET @add_fin_expenses_created_by_idx = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'fin_expenses'
      AND INDEX_NAME = 'fin_expenses_created_by_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `fin_expenses_created_by_idx` ON `fin_expenses`(`created_by`)'
);
PREPARE add_fin_expenses_created_by_idx_stmt FROM @add_fin_expenses_created_by_idx;
EXECUTE add_fin_expenses_created_by_idx_stmt;
DEALLOCATE PREPARE add_fin_expenses_created_by_idx_stmt;

SET @add_fin_revenues_created_by_idx = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'fin_revenues'
      AND INDEX_NAME = 'fin_revenues_created_by_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `fin_revenues_created_by_idx` ON `fin_revenues`(`created_by`)'
);
PREPARE add_fin_revenues_created_by_idx_stmt FROM @add_fin_revenues_created_by_idx;
EXECUTE add_fin_revenues_created_by_idx_stmt;
DEALLOCATE PREPARE add_fin_revenues_created_by_idx_stmt;

SET @add_acc_journal_entries_created_by_idx = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'acc_journal_entries'
      AND INDEX_NAME = 'acc_journal_entries_created_by_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `acc_journal_entries_created_by_idx` ON `acc_journal_entries`(`created_by`)'
);
PREPARE add_acc_journal_entries_created_by_idx_stmt FROM @add_acc_journal_entries_created_by_idx;
EXECUTE add_acc_journal_entries_created_by_idx_stmt;
DEALLOCATE PREPARE add_acc_journal_entries_created_by_idx_stmt;
