'use strict';
// Read-only forensic helper. Inventory deletions are not audited by the app, so this correlates
// (a) DELETE /api/products/:id lines found in the Apache access logs (time + client IP), with
// (b) staff login sessions (user + IP + time) around each deletion.
// Usage: node who-deleted-ingredients.cjs APP_DIR --ids=113,114,102,104,83,84 [--hits=/root/product-deletes.txt]
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const ids = (process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? '').split(',').map(Number).filter(Boolean);
const hitsFile = process.argv.find((a) => a.startsWith('--hits='))?.slice(7);
if (!ids.length) throw new Error('Usage: --ids=113,114');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const cairo = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseApacheTime(s) { // 01/Aug/2026:18:53:12 +0300
  const m = /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/.exec(s); if (!m) return null;
  const off = (Number(m[7].slice(0, 3)) * 60 + Number(m[7][0] + m[7].slice(3))) * 60000;
  return new Date(Date.UTC(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]) - off);
}

async function main() {
  const products = await p.inv_products.findMany({ where: { id: { in: ids } }, select: { id: true, product_code: true, name_ar: true, updated_at: true, is_deleted: true } });
  // Apache hits collected by the shell wrapper (one combined-log line per DELETE).
  const hits = [];
  if (hitsFile && fs.existsSync(hitsFile)) {
    for (const line of fs.readFileSync(hitsFile, 'utf8').split('\n')) {
      const m = /^(\S+) \S+ \S+ \[([^\]]+)\] "DELETE \/api\/products\/(\d+)[^"]*" (\d{3})/.exec(line);
      if (m) hits.push({ ip: m[1], at: parseApacheTime(m[2]), productId: Number(m[3]), status: Number(m[4]), raw: line.slice(0, 220) });
    }
  }
  const users = await p.users.findMany({ select: { user_id: true, username: true, name: true } });
  const uname = (id) => { const u = users.find((x) => x.user_id === id); return u ? `${u.name ?? ''} (${u.username ?? id})`.trim() : `user #${id}`; };
  const rows = [];
  for (const prod of products) {
    const when = hits.filter((h) => h.productId === prod.id).sort((a, b) => a.at - b.at);
    const t = when[0]?.at ?? prod.updated_at;
    // Sessions alive around the deletion (created before, not expired/revoked long before).
    const sessions = await p.staff_auth_sessions.findMany({
      where: { created_at: { lte: new Date(t.getTime() + 5 * 60000) }, OR: [{ last_used_at: { gte: new Date(t.getTime() - 6 * 3600000) } }, { created_at: { gte: new Date(t.getTime() - 12 * 3600000) } }] },
      select: { user_id: true, ip_address: true, user_agent: true, created_at: true, last_used_at: true },
      orderBy: { created_at: 'desc' },
    });
    const byIp = when.length ? sessions.filter((s) => when.some((h) => h.ip === s.ip_address)) : [];
    rows.push({
      id: prod.id, code: prod.product_code, name: prod.name_ar, deletedAt: cairo(t), deletedAtSource: when.length ? 'apache access log' : 'updated_at (approx.)',
      apacheHits: when.map((h) => ({ at: cairo(h.at), ip: h.ip, status: h.status })),
      likelyUser: byIp.length ? [...new Set(byIp.map((s) => uname(s.user_id)))] : null,
      usersLoggedInAround: [...new Set(sessions.map((s) => `${uname(s.user_id)} @ ${s.ip_address ?? '?'}`))],
    });
  }
  const text = ['من حذف الأصناف (استنتاج من لوج السيرفر وجلسات الدخول):', ''];
  for (const r of rows) text.push(`• ${r.name} [${r.code}] — ${r.deletedAt} — ${r.likelyUser ? 'الأرجح: ' + r.likelyUser.join(' أو ') : 'مش محدد؛ المستخدمين اللي كانوا داخلين وقتها: ' + (r.usersLoggedInAround.join('، ') || 'لا أحد')}`);
  process.stdout.write(`${JSON.stringify({ hitsParsed: hits.length, rows }, null, 2)}\n\n${text.join('\n')}\n`);
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
