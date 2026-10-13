const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/noamany_local_barcode_20261012') throw Error('Isolated local database required');
const result = spawnSync(process.execPath, [path.join(__dirname, '../node_modules/prisma/build/index.js'),
  'migrate', 'diff', '--from-url', url.toString(), '--to-schema-datamodel', path.join(__dirname, '../prisma/schema.prisma'), '--script'],
{ encoding: 'utf8', windowsHide: true });
if (result.status !== 0) { console.error(result.stderr.replaceAll(url.toString(), '[local database]')); process.exit(1); }
const destination = path.join(__dirname, '../../tmp/local-barcode-schema-diff.sql');
fs.writeFileSync(destination, result.stdout);
console.log(`Schema comparison saved to ${destination}`);
