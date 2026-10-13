const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const safety = require('./update-data-safety.cjs');

const baseline = { db: 'test', envHash: 'unchanged', counts: { users: 198, club_receipts: 33088, _prisma_migrations: 126 }, permissions: { rbac_roles: 'same' } };
test('data-preserving update accepts added tables and never accepts lost rows', () => {
  assert.doesNotThrow(() => safety.compareRows(baseline, { ...baseline, counts: { ...baseline.counts, _prisma_migrations: 128, new_table: 0 } }));
  assert.throws(() => safety.compareRows(baseline, { ...baseline, counts: { ...baseline.counts, club_receipts: 33087 } }), /lost rows/);
  assert.throws(() => safety.compareRows(baseline, { ...baseline, counts: { users: 198 } }), /lost rows/);
});
test('data-preserving update blocks changed env, database target or permissions', () => {
  assert.throws(() => safety.compareRows(baseline, { ...baseline, envHash: 'changed' }), /\.env changed/);
  assert.throws(() => safety.compareRows(baseline, { ...baseline, db: 'other' }), /Database target/);
  assert.throws(() => safety.compareRows(baseline, { ...baseline, permissions: { rbac_roles: 'changed' } }), /permission rows changed/);
});
test('only the three reviewed additive migration names are eligible', () => {
  assert.equal(safety.pendingAllowlist.size, 3);
  for (const name of safety.pendingAllowlist) {
    const text = fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8');
    assert.doesNotMatch(text, /^\s*(?:DROP\s|TRUNCATE\s|DELETE\s|REPLACE\s|INSERT\s|LOAD\s+DATA\s)/im);
  }
});
test('deployment script never performs SQL import, reset, seeds or .env replacement', () => {
  const text = fs.readFileSync(path.join(__dirname, '../update-noamany.sh'), 'utf8');
  assert.doesNotMatch(text, /prisma\s+(?:db\s+push|migrate\s+reset)|npm\s+run\s+db:seed|gzip\s+-dc|mysql\s+.*<\s|cp\s+.*\.env/);
  assert.match(text, /touch "\$APP_DIR\/tmp\/restart\.txt"/);
  assert.match(text, /h\.release===process\.argv\[3\]/);
  assert.match(text, /node "\$CHECK" after/);
  assert.match(text, /--configured-database/);
});
