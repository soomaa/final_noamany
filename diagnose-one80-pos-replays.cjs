'use strict';
// READ-ONLY. Proves whether the POS request-id replay (fixed 2026-09-28) ever swallowed a sale.
// Every successful "POST /api/quick-sales" in the Apache access logs must have created an invoice
// in the database within seconds. A 2xx save that created no invoice = the server answered with an
// older invoice (a replay). Zero unmatched saves over the log coverage → the bug lost no sale.
// Usage: node diagnose-one80-pos-replays.cjs APP_DIR [--since=2026-09-20] [--logs=/a.log,/b.gz]
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { createRequire } = require('node:module');

const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const since = arg('since') ?? '2026-09-20';
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });

const DOMAIN = 'one80.alatheertech.com';
const DIRS = [
  '/var/log/apache2/domlogs/alatheertech', '/var/log/apache2/domlogs',
  '/usr/local/apache/domlogs/alatheertech', '/usr/local/apache/domlogs',
  '/etc/apache2/logs/domlogs/alatheertech', '/etc/apache2/logs/domlogs',
  '/home/alatheertech/logs', '/home/alatheertech/access-logs',
];
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const LINE = /\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\] "(\w+) (\S+)[^"]*" (\d{3}) (\S+)/;
const CAIRO_MS = 3 * 3600_000; // Egypt is UTC+3 through the end of October 2026
const cairo = (ms) => new Date(ms + CAIRO_MS).toISOString().replace('T', ' ').slice(0, 19);
const sinceMs = Date.parse(`${since}T00:00:00+03:00`);

function logFiles() {
  const explicit = arg('logs');
  const found = new Map();
  const candidates = explicit ? explicit.split(',') : DIRS.flatMap((dir) => {
    try { return fs.readdirSync(dir).filter((n) => n.startsWith(DOMAIN) && !n.includes('bytes')).map((n) => path.join(dir, n)); } catch { return []; }
  });
  for (const file of candidates) {
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) continue;
      found.set(fs.realpathSync(file), st.size);
    } catch { /* unreadable */ }
  }
  return [...found].map(([file, size]) => ({ file, size }));
}

function kindOf(method, url) {
  if (method !== 'POST') return null;
  const pathOnly = url.split('?')[0].replace(/\/+$/, '');
  if (pathOnly === '/api/quick-sales') return 'create';
  if (/^\/api\/quick-sales\/\d+\/finalize$/.test(pathOnly)) return 'finalize';
  // dryRun previews on the old sell routes answer 2xx without writing an invoice.
  if (/^\/api\/cafe-products\/(sell-cart|\d+\/sell)$/.test(pathOnly)) return /[?&]dryRun=(true|1)\b/i.test(url) ? null : 'legacySell';
  return null;
}

async function scan(file) {
  const counts = new Map(); // raw line -> occurrences in THIS file
  let first = null; let last = null; let lines = 0;
  const input = fs.createReadStream(file);
  const stream = file.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    lines += 1;
    const m = LINE.exec(line);
    if (!m) continue;
    const [, d, mon, y, h, mi, s, sign, oh, om, method, url] = m;
    const ms = Date.UTC(+y, MONTHS[mon], +d, +h, +mi, +s) - (sign === '-' ? -1 : 1) * (+oh * 60 + +om) * 60_000;
    if (first === null || ms < first) first = ms;
    if (last === null || ms > last) last = ms;
    if (ms < sinceMs || !kindOf(method, url)) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return { counts, first, last, lines };
}

async function main() {
  const files = logFiles();
  const merged = new Map(); // same request can sit in the live log AND the monthly archive: take the max, never the sum
  const coverage = [];
  for (const f of files) {
    try {
      const r = await scan(f.file);
      coverage.push({ file: f.file, sizeMB: +(f.size / 1048576).toFixed(1), lines: r.lines, from: r.first && cairo(r.first), to: r.last && cairo(r.last), posRequests: [...r.counts.values()].reduce((a, b) => a + b, 0) });
      for (const [line, n] of r.counts) merged.set(line, Math.max(merged.get(line) ?? 0, n));
    } catch (e) { coverage.push({ file: f.file, error: e.message }); }
  }
  const requests = [];
  for (const [line, n] of merged) {
    const m = LINE.exec(line);
    const [, d, mon, y, h, mi, s, sign, oh, om, method, url, status, bytes] = m;
    const ms = Date.UTC(+y, MONTHS[mon], +d, +h, +mi, +s) - (sign === '-' ? -1 : 1) * (+oh * 60 + +om) * 60_000;
    for (let i = 0; i < n; i += 1) requests.push({ ms, kind: kindOf(method, url), status: +status, bytes });
  }
  requests.sort((a, b) => a.ms - b.ms);
  const covered = requests.length ? { from: cairo(requests[0].ms), to: cairo(requests[requests.length - 1].ms) } : null;

  const rows = await p.sales_quick_sales.findMany({
    where: { created_at: { gte: new Date(sinceMs) } },
    select: { id: true, sale_number: true, created_at: true, status: true, sale_type: true, client_request_id: true, total_amount: true },
    orderBy: { created_at: 'asc' },
  });
  // Match each successful create/legacy save to the invoice it created (row written within the request's lifetime).
  const free = rows.map((r) => ({ ...r, ms: r.created_at.getTime(), used: false }));
  const unmatched = [];
  for (const rq of requests) {
    if (!(rq.kind === 'create' || rq.kind === 'legacySell') || rq.status < 200 || rq.status >= 300) continue;
    const hit = free.find((r) => !r.used && r.ms >= rq.ms - 2_000 && r.ms <= rq.ms + 45_000);
    if (hit) { hit.used = true; rq.sale = hit.sale_number; } else if (rq.kind === 'create') unmatched.push(rq);
  }
  const logFrom = requests.length ? requests[0].ms - 60_000 : Infinity;
  const logTo = requests.length ? requests[requests.length - 1].ms + 60_000 : -Infinity;

  const perDay = {};
  const day = (ms) => cairo(ms).slice(0, 10);
  const bump = (d, k, n = 1) => { perDay[d] = perDay[d] ?? { saves2xx: 0, savesFailed: {}, finalize2xx: 0, legacySell2xx: 0, invoicesCreated: 0, invoicesWithRequestId: 0, savesWithoutInvoice: 0, invoicesWithoutLoggedSave: 0 }; perDay[d][k] += n; };
  for (const rq of requests) {
    const d = day(rq.ms);
    const ok = rq.status >= 200 && rq.status < 300;
    if (rq.kind === 'create' && ok) bump(d, 'saves2xx');
    else if (rq.kind === 'create') { bump(d, 'saves2xx', 0); perDay[d].savesFailed[rq.status] = (perDay[d].savesFailed[rq.status] ?? 0) + 1; }
    else if (rq.kind === 'finalize' && ok) bump(d, 'finalize2xx');
    else if (rq.kind === 'legacySell' && ok) bump(d, 'legacySell2xx');
  }
  for (const r of free) {
    const d = day(r.ms);
    bump(d, 'invoicesCreated');
    if (r.client_request_id) bump(d, 'invoicesWithRequestId');
    if (!r.used && r.ms >= logFrom && r.ms <= logTo) bump(d, 'invoicesWithoutLoggedSave');
  }
  for (const rq of unmatched) bump(day(rq.ms), 'savesWithoutInvoice');

  const details = unmatched.slice(0, 60).map((rq) => {
    const before = free.filter((r) => r.ms <= rq.ms).slice(-1)[0];
    const failedJustBefore = requests.filter((x) => x.kind === 'create' && (x.status < 200 || x.status >= 300) && x.ms <= rq.ms && x.ms >= rq.ms - 5 * 60_000).map((x) => `${cairo(x.ms)} → ${x.status}`);
    return { at: cairo(rq.ms), status: rq.status, bytes: rq.bytes, previousInvoice: before ? `${before.sale_number} @ ${cairo(before.ms)} (${before.sale_type}, ${Number(before.total_amount)})` : null, failedSavesInPrevious5Min: failedJustBefore };
  });
  const firstRequestId = rows.find((r) => r.client_request_id);
  const verdict = !requests.length
    ? 'NO LOG DATA — the access logs were not found or already rotated; cannot prove it from logs'
    : unmatched.length === 0
      ? `NO REPLAY: every successful POS save between ${covered.from} and ${covered.to} (Cairo) created its own invoice`
      : `${unmatched.length} successful save(s) created no new invoice — see replays (a same-cart retry is harmless; a different cart was lost)`;
  const days = Object.fromEntries(Object.keys(perDay).sort().map((d) => [d, perDay[d]]));
  process.stdout.write(`${JSON.stringify({ since, verdict, requestIdFirstSeen: firstRequestId ? cairo(firstRequestId.created_at.getTime()) : null, logCoverage: coverage, perDay: days, replays: details })}\n`.replace(/,"(?=\d{4}-\d{2}-\d{2}":)/g, ',\n"'));
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
