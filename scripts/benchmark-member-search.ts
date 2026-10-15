// Local, synthetic SQL benchmark. Temporary rows disappear when the connection closes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { memberCodeSearchTerms } from '../backend/src/modules/club-members/club-member.utils';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../backend/.env', import.meta.url).pathname, quiet: true });
const { PrismaClient } = require('@prisma/client');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local DB only');
const db = new PrismaClient();
async function benchmark() {
  return db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`CREATE TEMPORARY TABLE one80_search_qa (
      id INT PRIMARY KEY, member_code VARCHAR(30) NOT NULL, name VARCHAR(200),
      phone VARCHAR(20), card_number VARCHAR(30), branch_id INT, gender VARCHAR(10),
      is_deleted BOOLEAN, UNIQUE KEY code_idx (member_code), KEY branch_idx(branch_id),
      KEY phone_idx(phone), KEY card_idx(card_number)
    ) ENGINE=InnoDB`);
    for (let start = 1; start <= 60000; start += 1000) {
      const values: unknown[] = [];
      for (let id = start; id < start + 1000; id++) {
        const branch = id <= 30000 ? 1 : 2;
        const seq = branch === 1 ? id : id - 30000;
        values.push(id, `${branch === 1 ? 'A' : 'B'}${String(seq).padStart(6, '0')}`,
          `Synthetic ${id}`, String(10000000000 + id), null, branch, 'female', false);
      }
      await tx.$executeRawUnsafe(`INSERT INTO one80_search_qa VALUES ${Array(1000).fill('(?,?,?,?,?,?,?,?)').join(',')}`, ...values);
    }
    const terms = memberCodeSearchTerms('7', [2]);
    const scope = "is_deleted=0 AND branch_id=2 AND gender='female'";
    const oldFast = `SELECT id,member_code FROM one80_search_qa WHERE ${scope}
      AND (member_code='7' OR member_code LIKE '7%' OR phone='7' OR card_number='7') ORDER BY member_code LIMIT 20`;
    const oldPartial = `SELECT id,member_code FROM one80_search_qa WHERE ${scope}
      AND member_code LIKE '%7%' ORDER BY member_code LIMIT 20`;
    const newFast = `SELECT id,member_code FROM one80_search_qa WHERE ${scope} AND
      (${terms.exact.map(() => 'member_code=?').join(' OR ')} OR ${terms.prefixes.map(() => 'member_code LIKE ?').join(' OR ')})
      ORDER BY member_code LIMIT 20`;
    const args = [...terms.exact, ...terms.prefixes.map(prefix => `${prefix}%`)];
    const oldTimes: number[] = [], newTimes: number[] = [];
    for (let run = 0; run < 9; run++) {
      let start = performance.now();
      await tx.$queryRawUnsafe(oldFast);
      await tx.$queryRawUnsafe(oldPartial);
      if (run) oldTimes.push(performance.now() - start);
      start = performance.now();
      const rows = await tx.$queryRawUnsafe(newFast, ...args);
      assert.equal(rows[0].member_code, 'B000007');
      assert.ok(rows.length >= 10);
      if (run) newTimes.push(performance.now() - start);
    }
    const median = (values: number[]) => values.sort((a,b) => a-b)[Math.floor(values.length/2)];
    return { syntheticRows: 60000, runs: 8, identityDatabaseCalls: { before: 2, after: 1 },
      medianMs: { before: median(oldTimes), after: median(newTimes) },
      newPlan: await tx.$queryRawUnsafe(`EXPLAIN ${newFast}`, ...args) };
  }, { timeout: 60000 });
}
benchmark().then(result => console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? String(value) : value, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
