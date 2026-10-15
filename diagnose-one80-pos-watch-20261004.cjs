'use strict';
// Run the deployed POS stock-watch service with a SELECT-only model facade.
// No HTTP login, application bootstrap, mutations, or service restart.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || process.cwd());
const report = { info: {
  capturedUtc: new Date().toISOString(), branchId: 1,
  note: 'Deployed watch service logic in a consistent read snapshot, with a read-only newest-open-shift selector. This is not a capture of the cashier browser or its historical HTTP response. Only SELECT model methods are exposed.',
} };
let db;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function main() {
  const req = createRequire(path.join(app, 'package.json'));
  req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
  const { PrismaClient } = req('@prisma/client');
  db = new PrismaClient({ log: [{ level: 'error', emit: 'event' }] });
  const serviceFile = path.join(app, 'dist/modules/sales/pos-stock-watch.service.js');
  report.files = ['dist/modules/sales/pos-stock-watch.service.js', 'dist/modules/sales/shift-sessions.service.js', 'public/index.html'].map(relative => {
    const file = path.join(app, relative);
    return fs.existsSync(file) ? { file: relative, sha256: hash(fs.readFileSync(file)), modifiedUtc: fs.statSync(file).mtime.toISOString() } : { file: relative, missing: true };
  });
  const assets = path.join(app, 'public/assets');
  report.frontendWatchCode = [];
  report.frontendWatchCodeNote = 'Matching files may include old assets; their presence alone does not establish which bundle the cashier loaded.';
  if (fs.existsSync(assets)) for (const name of fs.readdirSync(assets)) {
    if (!name.endsWith('.js')) continue;
    const full = path.join(assets, name);
    if (fs.statSync(full).size > 5 * 1024 * 1024) continue;
    const source = fs.readFileSync(full, 'utf8');
    const index = source.indexOf('/pos/stock-watch');
    if (index !== -1) report.frontendWatchCode.push({ file: name, sha256: hash(source),
      excerpt: source.slice(Math.max(0, index - 200), index + 550) });
  }
  const { PosStockWatchService } = req(serviceFile);
  await db.$transaction(async tx => {
    const read = {};
    for (const model of ['inv_warehouses', 'sales_pos_settings', 'inv_products', 'inv_stock_balances', 'inv_movements', 'sales_shift_sessions']) {
      read[model] = {};
      for (const method of ['findFirst', 'findUnique', 'findMany', 'groupBy', 'aggregate', 'count']) {
        read[model][method] = args => tx[model][method](args);
      }
      Object.freeze(read[model]);
    }
    Object.freeze(read);
    report.watchSource = {
      warehouse: await read.inv_warehouses.findFirst({
        where: { branch_id: 1, is_deleted: false }, orderBy: { id: 'asc' },
        select: { id: true, name_ar: true, branch_id: true },
      }),
      waterBalances: await read.inv_stock_balances.findMany({
        where: { product_id: 36, warehouse: { branch_id: 1 } }, take: 20,
        select: { product_id: true, warehouse_id: true, current_stock: true, last_updated: true },
      }),
    };
    const sessions = { findBranchSessionForSale: (client, branchId) => client.sales_shift_sessions.findFirst({
      where: { branch_id: branchId, status: 'open' }, orderBy: { id: 'desc' },
    }) };
    const service = new PosStockWatchService(read, sessions, { isBranchAllowed: () => true });
    report.watch = await service.watch(1);
    report.recentShifts = await tx.sales_shift_sessions.findMany({
      where: { branch_id: 1 }, take: 8, orderBy: { id: 'desc' },
      select: { id: true, shift_id: true, session_date: true, status: true, start_time: true, end_time: true },
    });
    const anchor = await tx.inv_movements.findUnique({ where: { id: 3373 },
      select: { id: true, product_id: true, warehouse_id: true, created_at: true, balance_after: true } });
    report.reconstructedAt176 = [];
    if (anchor && anchor.product_id === 36 && Number(anchor.balance_after) === 176) {
      const candidates = await tx.sales_shift_sessions.findMany({
        where: { branch_id: 1, start_time: { lte: anchor.created_at }, OR: [{ end_time: null }, { end_time: { gt: anchor.created_at } }] },
        orderBy: { id: 'desc' }, take: 5,
        select: { id: true, shift_id: true, status: true, start_time: true, end_time: true },
      });
      for (const shift of candidates) {
        const sum = await tx.inv_movements.aggregate({
          where: { product_id: 36, warehouse_id: anchor.warehouse_id, id: { lte: anchor.id }, movement_date: { gte: shift.start_time } },
          _sum: { quantity: true },
        });
        report.reconstructedAt176.push({ shift, anchor,
          movementNetThroughAnchorId: Number(sum._sum.quantity || 0),
          inferredOpeningStock: 176 - Number(sum._sum.quantity || 0),
          note: 'Reconstructed using present shift records and movement-ID ordering; not an archived browser response.',
        });
      }
    }
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30000 });
  for (const [name, value] of Object.entries(report)) {
    console.log('\n=== ' + name + ' ===');
    for (const row of Array.isArray(value) ? value : [value]) console.log(JSON.stringify(row));
  }
}
main().catch(e => { console.error('READ_FAILED', e.code || e.name); process.exitCode = 1; })
  .finally(async () => { if (db) await db.$disconnect(); });
