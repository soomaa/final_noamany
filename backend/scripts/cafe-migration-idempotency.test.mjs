import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'prisma/migrations/20260909160000_noamany_cafe_wave1/migration.sql'),
  'utf8',
);

for (const table of ['inv_product_packages', 'cafe_waste_reasons', 'cafe_waste_records']) {
  assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS `' + table + '`'), table);
}

for (const table of [
  'inv_products',
  'prc_supplier_invoice_items',
  'sales_quick_sales',
  'sales_quick_sale_items',
  'sales_billing_statements',
  'sales_pos_payment_methods',
  'sales_pos_payments',
]) {
  assert.doesNotMatch(
    migration,
    new RegExp('^ALTER TABLE `' + table + '`[\\s\\S]*?\\n\\s+ADD (?:COLUMN|INDEX|CONSTRAINT)', 'm'),
    `${table} has unconditional additive DDL`,
  );
}

assert.match(migration, /information_schema\.columns/);
assert.match(migration, /information_schema\.statistics/);
assert.match(migration, /information_schema\.table_constraints/);
