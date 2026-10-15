#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const archive = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: code-only-release-gate.mjs <release.zip>');
const unzip = (...args) => execFileSync('unzip', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
unzip('-tqq', archive);
const entries = unzip('-Z1', archive).split(/\r?\n/).filter(Boolean);
const forbidden = entries.filter((entry) => {
  const lower = entry.toLowerCase();
  return /(^|\/)\.env(?:\.|$)/.test(lower) ||
    /^(uploads?|private-uploads|private_uploads|data|database|backups?)(\/|$)/.test(lower) ||
    lower === 'db-import.sql' || lower === 'import-data.sh' ||
    (lower.endsWith('.sql') && !/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(lower));
});
if (forbidden.length) throw new Error(`forbidden data or secret paths: ${forbidden.slice(0, 20).join(', ')}`);
for (const required of [
  'public/index.html',
  'server-deploy.sh',
  'prisma/migrations/20260829160000_subscription_type_branch_prices/migration.sql',
  'prisma/migrations/20260830123000_subscription_renewal_chain/migration.sql',
]) {
  if (!entries.includes(required)) throw new Error(`missing required artifact: ${required}`);
}
const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${checksum}  ${basename(archive)}\n`);
console.log(`CODE_ONLY_RELEASE_OK ${basename(archive)} sha256=${checksum}`);
