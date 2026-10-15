import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPrismaDiff, redactDatasourceUrls } from './check-schema-drift.mjs';

test('classifies destructive Prisma drift without returning raw SQL', () => {
  const result = classifyPrismaDiff(`
-- DropForeignKey
ALTER TABLE \`child\` DROP FOREIGN KEY \`child_parent_fkey\`;
-- DropIndex
DROP INDEX \`employee_branch_idx\` ON \`employees\`;
-- AlterTable
ALTER TABLE \`employees\` DROP COLUMN \`private_note\`, ADD COLUMN \`safe\` VARCHAR(20);
-- DropTable
DROP TABLE \`legacy_payroll\`;
`);

  assert.deepEqual(result, {
    hasDrift: true,
    isDestructive: true,
    statementCount: 4,
    destructive: {
      dropTable: 1,
      dropColumn: 1,
      dropIndex: 1,
      dropForeignKey: 1,
    },
  });
  assert.equal('sql' in result, false);
});

test('reports non-destructive drift separately', () => {
  assert.deepEqual(
    classifyPrismaDiff('CREATE TABLE `new_table` (`id` INTEGER NOT NULL);'),
    {
      hasDrift: true,
      isDestructive: false,
      statementCount: 1,
      destructive: {
        dropTable: 0,
        dropColumn: 0,
        dropIndex: 0,
        dropForeignKey: 0,
      },
    },
  );
});

test('treats Prisma empty-migration output as no drift', () => {
  assert.deepEqual(classifyPrismaDiff('-- This is an empty migration.\n'), {
    hasDrift: false,
    isDestructive: false,
    statementCount: 0,
    destructive: {
      dropTable: 0,
      dropColumn: 0,
      dropIndex: 0,
      dropForeignKey: 0,
    },
  });
});

test('redacts MySQL datasource URLs from command errors', () => {
  const redacted = redactDatasourceUrls(
    'failed mysql://admin:super-secret@localhost:3306/one80_hr?x=1 now',
  );

  assert.equal(redacted, 'failed [REDACTED_DATABASE_URL] now');
  assert.doesNotMatch(redacted, /admin|super-secret|one80_hr/);
});
