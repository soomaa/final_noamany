import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('online-subscription payment-method foreign-key migration', () => {
  const migrationPath = resolve(
    process.cwd(),
    'prisma/migrations/20260927170000_online_subscription_payment_method_source/migration.sql',
  );

  it('removes the incompatible POS constraint and retains an indexed informational payment-method id', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    const dropOldConstraint = sql.indexOf('DROP FOREIGN KEY `fk_online_subscription_payment_method`');
    expect(dropOldConstraint).toBeGreaterThanOrEqual(0);
    expect(sql).toContain('information_schema.TABLE_CONSTRAINTS');
    expect(sql).toContain('ADD INDEX `idx_online_subscription_payment_method` (`payment_method_id`)');
    expect(sql).not.toContain('ADD CONSTRAINT');
  });
});
