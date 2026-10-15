'use strict';
// Reads existing access logs and the active HTML entry point. No DB, HTTP requests,
// application bootstrap, credentials, process control, or configuration changes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DOMAIN = 'one80.alatheertech.com';
const START = Date.parse('2026-10-03T21:00:00Z'); // Oct 4, 00:00 Cairo
const END = Date.parse('2026-10-04T21:00:00Z');
const MAX_BYTES = 32 * 1024 * 1024;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseLine(line, salt) {
  // Combined/common Apache format. Ignore unrecognised formats, never print raw lines.
  const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]+" (\d{3}) (\S+)(?: "[^"]*" "([^"]*)")?/);
  if (!m || m[3] !== 'GET') return null;
  const date = m[2].match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!date || !MONTHS.includes(date[2])) return null;
  const offset = (Number(date[8]) * 60 + Number(date[9])) * (date[7] === '+' ? 1 : -1);
  const ms = Date.UTC(Number(date[3]), MONTHS.indexOf(date[2]), Number(date[1]), Number(date[4]), Number(date[5]), Number(date[6])) - offset * 60_000;
  let url;
  try { url = new URL(m[4], 'https://' + DOMAIN); } catch { return null; }
  const watch = url.pathname === '/api/pos/stock-watch';
  const asset = /^\/assets\/index-[a-zA-Z0-9_-]+\.js$/.test(url.pathname);
  if (!watch && !asset) return null;
  const branch = url.searchParams.get('branchId');
  return {
    ms, at: new Date(ms).toISOString(), type: watch ? 'watch' : 'bundle', status: Number(m[5]),
    // A temporary client grouping, not an authenticated user or a unique device.
    client: crypto.createHash('sha256').update(salt).update(m[1] + '\n' + (m[7] || '')).digest('hex').slice(0, 12),
    branchId: watch && /^\d{1,9}$/.test(branch || '') ? Number(branch) : null,
    asset: asset ? path.basename(url.pathname) : null,
  };
}

function readTail(file) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - MAX_BYTES);
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(size - start);
  let bytes;
  try { bytes = fs.readSync(fd, buffer, 0, buffer.length, start); }
  finally { fs.closeSync(fd); }
  let text = buffer.subarray(0, bytes).toString('utf8');
  if (start) text = text.slice(text.indexOf('\n') + 1);
  return { text, totalBytes: size, scannedBytes: bytes, truncated: start > 0 };
}

function main() {
  const app = path.resolve(process.argv[2] || process.cwd());
  const salt = crypto.randomBytes(32);
  const report = { info: {
    capturedUtc: new Date().toISOString(), mode: 'Existing files only; no DB or application changes',
    fromUtc: new Date(START).toISOString(), untilUtcExclusive: new Date(END).toISOString(),
    limits: 'Last 32 MiB per distinct log; current logs and .1 rotations only; compressed archives not scanned.',
    interpretation: 'Access logs establish requests and HTTP statuses, not response values or visible screen contents. Client groups use a temporary salted IP/user-agent hash and may combine devices. Missing requests are inconclusive when logs are absent, incomplete, rotated, or in an unsupported format.',
  }, activeHtml: {}, logs: [], clients: [] };
  const htmlPath = path.join(app, 'public/index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    report.activeHtml = {
      sha256: crypto.createHash('sha256').update(html).digest('hex'),
      assetReferences: [...new Set(html.match(/\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)/g) || [])],
    };
  }
  const dirs = ['/usr/local/apache/domlogs', '/etc/apache2/logs/domlogs', '/home/alatheertech/access-logs'];
  const seen = new Set();
  const groups = new Map();
  for (const dir of dirs) for (const name of [DOMAIN, DOMAIN + '-ssl_log', DOMAIN + '.1', DOMAIN + '-ssl_log.1']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) continue;
      const identity = `${stat.dev}:${stat.ino}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const tail = readTail(file);
      const log = { file, totalBytes: tail.totalBytes, scannedBytes: tail.scannedBytes, truncated: tail.truncated,
        matchingRows: 0, firstMatchingUtc: null, lastMatchingUtc: null };
      for (const line of tail.text.split('\n')) {
        const row = parseLine(line, salt);
        if (!row || row.ms < START || row.ms >= END) continue;
        log.matchingRows++;
        if (!log.firstMatchingUtc || row.at < log.firstMatchingUtc) log.firstMatchingUtc = row.at;
        if (!log.lastMatchingUtc || row.at > log.lastMatchingUtc) log.lastMatchingUtc = row.at;
        if (!groups.has(row.client)) groups.set(row.client, { watch: [], bundles: new Map() });
        const group = groups.get(row.client);
        if (row.type === 'watch') group.watch.push({ at: row.at, status: row.status, branchId: row.branchId });
        else {
          const key = row.asset + ':' + row.status;
          const old = group.bundles.get(key);
          group.bundles.set(key, { asset: row.asset, status: row.status, requests: (old?.requests || 0) + 1,
            firstAt: old && old.firstAt < row.at ? old.firstAt : row.at,
            lastAt: old && old.lastAt > row.at ? old.lastAt : row.at });
        }
      }
      report.logs.push(log);
    } catch (e) { report.logs.push({ file, readError: e.code || e.name }); }
  }
  for (const [client, group] of groups) {
    if (!group.watch.length) continue;
    group.watch.sort((a, b) => a.at.localeCompare(b.at));
    const counts = {};
    const gaps = [];
    for (let i = 0; i < group.watch.length; i++) {
      const row = group.watch[i];
      counts[row.status] = (counts[row.status] || 0) + 1;
      if (i && row.branchId === group.watch[i - 1].branchId) {
        const seconds = (Date.parse(row.at) - Date.parse(group.watch[i - 1].at)) / 1000;
        if (seconds >= 180) gaps.push({ from: group.watch[i - 1].at, to: row.at, seconds });
      }
    }
    report.clients.push({ client, requests: group.watch.length, statusCounts: counts,
      firstRequest: group.watch[0], lastRequest: group.watch.at(-1),
      lastRequests: group.watch.slice(-15), failures: group.watch.filter(r => r.status >= 400).slice(-20),
      longestGaps: gaps.sort((a, b) => b.seconds - a.seconds).slice(0, 8),
      requestedBundles: [...group.bundles.values()].slice(-20) });
  }
  report.clients.sort((a, b) => b.requests - a.requests);
  report.omittedClientGroups = Math.max(0, report.clients.length - 40);
  report.clients = report.clients.slice(0, 40);
  for (const [section, value] of Object.entries(report)) {
    console.log('\n=== ' + section + ' ===');
    for (const row of Array.isArray(value) ? value : [value]) console.log(JSON.stringify(row));
  }
}

module.exports = { parseLine };
if (require.main === module) {
  try { main(); } catch (e) { console.error('READ_FAILED', e.code || e.name); process.exitCode = 1; }
}
