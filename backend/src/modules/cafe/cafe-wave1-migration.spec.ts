import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('cafe Wave 1 migration safety', () => {
  const migrationPath = join(
    process.cwd(),
    'prisma/migrations/20260909160000_noamany_cafe_wave1/migration.sql',
  );

  it('contains only additive schema changes and no operational data or source branding', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `cafe_waste_records`/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `inv_product_packages`/);
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b/im);
    expect(sql).not.toMatch(/ONE80|one80_access|one80_refresh/i);
  });
});
