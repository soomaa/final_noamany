import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('CRM conversion link ships as an additive migration matching the Prisma schema', () => {
  const root = join(__dirname, '../../..');
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(join(root, 'prisma/migrations/20260909113000_sales_portal_crm_conversion_link/migration.sql'), 'utf8');

  expect(schema).toMatch(/model club_leads[\s\S]*converted_member_id Int\?/);
  expect(schema).toMatch(/model club_lead_follow_ups[\s\S]*interests\s+String\?/);
  expect(migration).toContain('ADD COLUMN `converted_member_id` INTEGER NULL');
  expect(migration).toContain('ADD COLUMN `interests` TEXT NULL');
  expect(migration).toContain('ADD INDEX `club_leads_converted_member_id_idx`');
  expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|MODIFY)\b/i);
});
