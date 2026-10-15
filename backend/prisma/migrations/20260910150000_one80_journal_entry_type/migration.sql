-- Journal entries gain a presentation-level type (يومي / شهري / سنوي) so the
-- accounting UI can label and filter entries the way the reference build does.
-- Purely additive: every existing row keeps behaving as a daily entry.
ALTER TABLE `acc_journal_entries`
  ADD COLUMN `entry_type` VARCHAR(20) NOT NULL DEFAULT 'daily';

CREATE INDEX `acc_journal_entries_entry_type_idx` ON `acc_journal_entries`(`entry_type`);
