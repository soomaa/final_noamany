/* eslint-disable no-console */
/**
 * Builds a guarded MySQL import file from the customer's legacy phpMyAdmin dump.
 *
 * Usage:
 *   node prisma/scripts/build-real-hr-core-import.js <legacy.sql> [output.sql]
 *
 * The generated file is intentionally tied to the known demo foundation currently
 * installed in the target. It refuses to run if those row counts have changed,
 * creates backup tables, replaces the demo HR core, and validates relationships.
 */
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = process.argv[2];
const outputPath = process.argv[3]
  || path.resolve(__dirname, '../imports/noamany-real-hr-core-20260812.sql');

if (!sourcePath) {
  throw new Error('Pass the legacy SQL dump path as the first argument.');
}

const SOURCE_TABLES = [
  'tbl_branches',
  'all_defined_setting',
  'employees',
  'tbl_hdodr_setting',
  'hr_emp_dwam',
  'hr_emp_dwam_details',
  'tbl_hdoor_dawms_emps',
  'hr_finance_employes',
  'hr_emp_agazat_dayes',
];

const DEMO_COUNTS = {
  tbl_branches: 7,
  all_defined_setting: 12,
  employees: 36,
  tbl_hdodr_setting: 4,
  hr_emp_dwam: 36,
  hr_emp_dwam_details: 36,
  tbl_hdoor_dawms_emps: 36,
  hr_finance_employes: 36,
  hr_emp_agazat_dayes: 53,
  employees_branches: 36,
  emp_files: 11,
};

const BACKUP_PREFIX = 'zz_backup_20260812_real_hr_';
const FINAL_COUNT_ADJUSTMENTS = {
  // Four catalog rows are migrated from the legacy emp_badlat_discount_settings
  // lookup because the new app intentionally uses all_defined_setting instead.
  all_defined_setting: 4,
  // These two source rows belong to deleted employee 76 and are legacy orphans.
  tbl_hdoor_dawms_emps: -1,
  hr_emp_agazat_dayes: -1,
};
const sql = fs.readFileSync(path.resolve(sourcePath), 'utf8');

function extractInsertStatements(table) {
  const marker = `INSERT INTO \`${table}\``;
  const statements = [];
  let cursor = 0;
  while (true) {
    const start = sql.indexOf(marker, cursor);
    if (start === -1) break;
    let inString = false;
    let escaped = false;
    let end = start;
    for (; end < sql.length; end += 1) {
      const char = sql[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString && char === '\\') {
        escaped = true;
        continue;
      }
      if (char === "'") {
        if (inString && sql[end + 1] === "'") {
          end += 1;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && char === ';') {
        end += 1;
        break;
      }
    }
    if (inString || end > sql.length) {
      throw new Error(`Unterminated INSERT statement for ${table}`);
    }
    statements.push(sql.slice(start, end));
    cursor = end;
  }
  if (statements.length === 0) throw new Error(`No INSERT statements found for ${table}`);
  return statements;
}

function countRows(statement) {
  const valuesAt = statement.indexOf(' VALUES');
  if (valuesAt === -1) throw new Error('INSERT has no VALUES clause');
  let inString = false;
  let escaped = false;
  let depth = 0;
  let rows = 0;
  for (let i = valuesAt + 7; i < statement.length; i += 1) {
    const char = statement[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === "'") {
      if (inString && statement[i + 1] === "'") {
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '(') {
      if (depth === 0) rows += 1;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    }
  }
  if (depth !== 0 || inString) throw new Error('Could not count INSERT rows safely');
  return rows;
}

const insertsByTable = new Map();
const sourceCounts = {};
for (const table of SOURCE_TABLES) {
  const statements = extractInsertStatements(table);
  insertsByTable.set(table, statements);
  sourceCounts[table] = statements.reduce((sum, statement) => sum + countRows(statement), 0);
}

const backupTables = [...SOURCE_TABLES, 'employees_branches', 'emp_files'];
const deleteOrder = [
  'emp_files',
  'employees_branches',
  'hr_emp_agazat_dayes',
  'hr_finance_employes',
  'tbl_hdoor_dawms_emps',
  'hr_emp_dwam_details',
  'hr_emp_dwam',
  'tbl_hdodr_setting',
  'employees',
  'all_defined_setting',
  'tbl_branches',
];

const guardConditions = Object.entries(DEMO_COUNTS)
  .map(([table, count]) => `(SELECT COUNT(*) FROM \`${table}\`) <> ${count}`)
  .join('\n    OR ');

const backupSql = backupTables.map((table) => `
DROP TABLE IF EXISTS \`${BACKUP_PREFIX}${table}\`;
CREATE TABLE \`${BACKUP_PREFIX}${table}\` LIKE \`${table}\`;
INSERT INTO \`${BACKUP_PREFIX}${table}\` SELECT * FROM \`${table}\`;`).join('\n');

const insertSql = SOURCE_TABLES.map((table) => [
  `\n-- ${table}: ${sourceCounts[table]} real row(s)`,
  ...insertsByTable.get(table),
].join('\n')).join('\n');

const expectedChecks = SOURCE_TABLES
  .map((table) => `IF (SELECT COUNT(*) FROM \`${table}\`) <> ${sourceCounts[table] + (FINAL_COUNT_ADJUSTMENTS[table] || 0)} THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: ${table} row count';
  END IF;`)
  .join('\n  ');

const output = `-- Noamany real HR core import
-- Generated from: ${path.basename(sourcePath)}
-- Generated at: ${new Date().toISOString()}
-- Target: the NEW system database selected in phpMyAdmin/MySQL.
-- Scope: real branches, employees, attendance shifts/assignments, weekly offs,
--        and employee financial components. Existing demo employee attachments
--        and demo secondary-branch rows are backed up then removed.
-- IMPORTANT: this file refuses to run unless the target still contains the exact
-- known demo row counts captured on 2026-08-12.

SET NAMES utf8mb4;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

DROP PROCEDURE IF EXISTS \`_guard_noamany_real_hr_import\`;
DELIMITER $$
CREATE PROCEDURE \`_guard_noamany_real_hr_import\`()
BEGIN
  IF DATABASE() IS NULL OR DATABASE() = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Select the NEW system database before importing';
  END IF;
  IF ${guardConditions} THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Import stopped: target is not the expected demo dataset';
  END IF;
END$$
DELIMITER ;
CALL \`_guard_noamany_real_hr_import\`();
DROP PROCEDURE \`_guard_noamany_real_hr_import\`;

-- Recoverable snapshots of every table changed by this import.
${backupSql}

SET @NOAMANY_OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

${deleteOrder.map((table) => `DELETE FROM \`${table}\`;`).join('\n')}

${insertSql}

-- branch_id_fk=0 means "not assigned" in the legacy database, not a real branch.
UPDATE \`employees\` SET branch_id_fk = NULL WHERE branch_id_fk = 0;

-- The new catalog replaces the removed emp_badlat_discount_settings table.
-- Only the four legacy components actually referenced by the imported finance rows
-- are added; their original IDs are collision-free in all_defined_setting.
INSERT INTO \`all_defined_setting\`
  (defined_id, defined_title, defined_type, defined_type_title, in_order)
VALUES
  (6,  'تأمينات اجتماعية', 2, 'deduction', 8),
  (9,  'راتب أساسي',       1, 'allowances', 1),
  (11, 'بدلات ثابتة',      1, 'allowances', 2),
  (12, 'بدلات متغيرة',     1, 'allowances', 3);

-- Verified stale rows in the customer dump: both point to deleted employee 76.
DELETE d FROM \`tbl_hdoor_dawms_emps\` d
LEFT JOIN \`employees\` e ON e.id = d.emp_id_fk
LEFT JOIN \`tbl_hdodr_setting\` s ON s.id = d.dwam_id_fk
WHERE e.id IS NULL OR s.id IS NULL;
DELETE a FROM \`hr_emp_agazat_dayes\` a
LEFT JOIN \`employees\` e ON e.id = a.emp_id_fk
WHERE e.id IS NULL;

-- The new employee editor/payroll engine stores the basic salary on employees.
-- Legacy code 100 is the actual basic-salary component in hr_finance_employes.
UPDATE \`employees\` e
JOIN (
  SELECT emp_id, MAX(value) AS basic_salary
  FROM \`hr_finance_employes\`
  WHERE badl_type = 1 AND badl_code = 100
  GROUP BY emp_id
) salary ON salary.emp_id = e.id
SET e.basic_salary = salary.basic_salary;

DROP PROCEDURE IF EXISTS \`_validate_noamany_real_hr_import\`;
DELIMITER $$
CREATE PROCEDURE \`_validate_noamany_real_hr_import\`()
BEGIN
  ${expectedChecks}
  IF EXISTS (
    SELECT 1 FROM \`employees\` e
    LEFT JOIN \`tbl_branches\` b ON b.branch_id = e.branch_id_fk
    WHERE e.branch_id_fk IS NOT NULL AND b.branch_id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: employee branch orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`hr_emp_dwam\` d
    LEFT JOIN \`employees\` e ON e.id = d.emp_id
    WHERE e.id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: schedule employee orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`hr_emp_dwam_details\` d
    LEFT JOIN \`employees\` e ON e.id = d.emp_id
    WHERE d.emp_id IS NOT NULL AND e.id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: schedule detail employee orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`tbl_hdoor_dawms_emps\` d
    LEFT JOIN \`employees\` e ON e.id = d.emp_id_fk
    LEFT JOIN \`tbl_hdodr_setting\` s ON s.id = d.dwam_id_fk
    WHERE e.id IS NULL OR s.id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: employee-shift link orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`hr_finance_employes\` f
    LEFT JOIN \`employees\` e ON e.id = f.emp_id
    WHERE f.emp_id IS NOT NULL AND e.id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: finance employee orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`hr_finance_employes\` f
    LEFT JOIN \`all_defined_setting\` c ON c.defined_id = f.badl_discount_id_fk
    WHERE c.defined_id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: finance component orphan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM \`hr_emp_agazat_dayes\` a
    LEFT JOIN \`employees\` e ON e.id = a.emp_id_fk
    WHERE e.id IS NULL
  ) THEN
    ROLLBACK;
    SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validation failed: weekly-off employee orphan';
  END IF;
END$$
DELIMITER ;
CALL \`_validate_noamany_real_hr_import\`();
DROP PROCEDURE \`_validate_noamany_real_hr_import\`;

COMMIT;
SET FOREIGN_KEY_CHECKS = @NOAMANY_OLD_FOREIGN_KEY_CHECKS;

-- Post-import summary returned by phpMyAdmin/MySQL.
${SOURCE_TABLES.map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS imported_rows FROM \`${table}\`;`).join('\n')}
SELECT COUNT(*) AS employees_with_basic_salary FROM \`employees\` WHERE basic_salary IS NOT NULL AND basic_salary > 0;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Created: ${outputPath}`);
console.log(JSON.stringify(sourceCounts, null, 2));
