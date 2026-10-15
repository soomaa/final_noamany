'use strict';
// READ-ONLY. Finds items handed out at the gym reception that are NOT linked to café stock:
// quick services (club_quick_services) and every club receipt whose description mentions a
// search term (default: water). Groups receipts by service/description and day.
// Usage: node diagnose-one80-reception-items.cjs APP_DIR [--search=مياه,مية,ميه,ماء,water] [--since=2026-09-01]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const terms = (arg('search') ?? 'مياه,مياة,مية,ميه,ماء,ماية,water').split(',').map((t) => t.trim()).filter(Boolean);
const since = arg('since') ?? '2026-09-01';
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });

async function main() {
  const services = await p.club_quick_services.findMany({ select: { id: true, name: true, price: true, is_active: true, branch_id: true, created_at: true, updated_at: true }, orderBy: { id: 'asc' } });
  const quickReceipts = await p.club_receipts.findMany({
    where: { type: 'quick_service', receipt_date: { gte: since } },
    select: { receipt_number: true, receipt_date: true, amount: true, status: true, description: true, created_by: true, created_at: true },
    orderBy: { id: 'asc' },
  });
  const byService = {};
  for (const r of quickReceipts) {
    const name = (r.description ?? '').replace(/^خدمة سريعة:\s*/, '').split(' — ')[0].trim() || '(بدون وصف)';
    const k = name;
    byService[k] = byService[k] ?? { receipts: 0, amount: 0, cancelled: 0, byDay: {} };
    if (r.status !== 'active' && r.status !== 'paid' && r.status !== 'completed') byService[k].cancelled += 1;
    byService[k].receipts += 1;
    byService[k].amount = Math.round((byService[k].amount + Number(r.amount)) * 100) / 100;
    byService[k].byDay[r.receipt_date] = (byService[k].byDay[r.receipt_date] ?? 0) + 1;
  }
  const mentioning = await p.club_receipts.findMany({
    where: { receipt_date: { gte: since }, OR: terms.map((t) => ({ description: { contains: t } })) },
    select: { receipt_number: true, receipt_date: true, amount: true, type: true, status: true, description: true, created_by: true },
    orderBy: { id: 'asc' },
    take: 2000,
  });
  const statuses = [...new Set(quickReceipts.map((r) => r.status))];
  const out = {
    since, terms,
    quickServices: services.map((s) => ({ ...s, price: Number(s.price), matchesTerm: terms.some((t) => s.name.includes(t)) })),
    quickServiceReceipts: { total: quickReceipts.length, statuses, byService },
    receiptsMentioningTerms: { count: mentioning.length, byTypeStatus: mentioning.reduce((m, r) => { const k = `${r.type}|${r.status}`; m[k] = (m[k] ?? 0) + 1; return m; }, {}), sample: mentioning.slice(0, 40) },
  };
  process.stdout.write(`${JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2)}\n`);
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
