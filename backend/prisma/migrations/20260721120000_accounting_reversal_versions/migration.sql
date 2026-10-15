-- A source document may be corrected after its original GL entry is reversed.
-- Keep every historical version while allowing exactly one row per source/version.
ALTER TABLE `acc_journal_entries`
  ADD COLUMN `source_version` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `acc_journal_entries`
  DROP INDEX `uq_acc_source_doc`,
  ADD UNIQUE INDEX `uq_acc_source_doc_version` (
    `source_module`,
    `source_doc_type`,
    `source_doc_id`,
    `source_version`
  );
