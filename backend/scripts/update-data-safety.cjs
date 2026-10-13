// Data-preserving deployment checks. No SQL restore, reset, seed or data deletion.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

const pendingAllowlist = new Set([
  '20260930110000_online_store_order_payment_review',
  '20261001120000_recovery_application_contract',
  '20261001123000_recovery_document_lead_relations',
]);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const identifier = name => '`' + String(name).replace(/`/g, '``') + '`';
function sha(file) { return hash(fs.readFileSync(file)); }

function verifyPackage(stage) {
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'verification/manifest.json')));
  if (!Array.isArray(manifest) || manifest.length < 1000) throw new Error('Invalid release manifest');
  for (const entry of manifest) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.startsWith('/') || entry.path.split('/').some(p => p === '..' || p === '.' || p === '.env' || p === 'uploads' || p === 'node_modules')) throw new Error('Unsafe release entry');
    const file = path.resolve(stage, entry.path);
    if (!file.startsWith(path.resolve(stage) + path.sep) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || sha(file) !== entry.sha256) throw new Error('Release integrity failed: ' + entry.path);
  }
  const expected = new Set(manifest.map(entry => entry.path));
  expected.add('verification/manifest.json');
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in release');
      if (entry.isDirectory()) walk(file);
      else if (!expected.has(path.relative(stage, file).replace(/\\/g, '/'))) throw new Error('Unlisted release file');
    }
  }
  walk(stage);
  console.log('RELEASE_FILES_VERIFIED');
}

function config(app, localTest) {
  const root = fs.realpathSync(app);
  if (!localTest && (process.platform !== 'linux' || root !== '/home/noamanycenter/final.noamanycenter.com' || process.getuid() === 0)) throw new Error('Run from the noamanycenter account, not root');
  const envFile = path.join(root, '.env');
  const req = createRequire(path.join(root, 'package.json'));
  const parsed = req('dotenv').parse(fs.readFileSync(envFile));
  const url = new URL(parsed.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Unexpected MySQL host');
  if (localTest) {
    if (process.platform !== 'win32') throw new Error('The local test mode is Windows-only');
    url.pathname = '/noamany_update_20261001_current';
  } else if (decodeURIComponent(url.pathname.slice(1)) !== 'noamanycenter_nest') throw new Error('Unexpected database name');
  const args = ['--protocol=TCP', '--host=' + url.hostname, '--port=' + (url.port || '3306'), '--user=' + decodeURIComponent(url.username), '--default-character-set=utf8mb4'];
  const mysql = localTest ? 'E:/xampp/mysql/bin/mysql.exe' : 'mysql';
  const dump = localTest ? 'E:/xampp/mysql/bin/mysqldump.exe' : 'mysqldump';
  return { root, envFile, envHash: sha(envFile), parsed, url, db: decodeURIComponent(url.pathname.slice(1)), args, mysql, dump, mysqlEnv: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) } };
}
function sql(c, statement) {
  const result = spawnSync(c.mysql, [...c.args, '--batch', '--raw', '--skip-column-names', c.db, '-e', statement], { env: c.mysqlEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'MySQL check failed').trim());
  return result.stdout.trimEnd();
}
function migrationPlan(c, stage) {
  const records = sql(c, 'SELECT migration_name, checksum, IF(finished_at IS NULL,0,1), IF(rolled_back_at IS NULL,0,1) FROM `_prisma_migrations` ORDER BY started_at;');
  const applied = new Set();
  const missingHistoricalFiles = [];
  for (const line of records.split('\n').filter(Boolean)) {
    const [name, checksum, finished, rolled] = line.replace(/\r$/, '').split('\t');
    if (rolled === '1') continue;
    if (finished !== '1') throw new Error('Existing failed/incomplete migration: ' + name + '. No automatic resolve is allowed.');
    applied.add(name);
    const file = path.join(stage, 'prisma/migrations', name, 'migration.sql');
    if (!fs.existsSync(file)) { missingHistoricalFiles.push(name); continue; }
    const original = fs.readFileSync(file, 'utf8');
    const lf = original.replace(/\r\n/g, '\n');
    if (![hash(original), hash(lf), hash(lf.replace(/\n/g, '\r\n'))].includes(checksum)) throw new Error('Applied migration differs from release: ' + name + '. Stop; do not rewrite history.');
  }
  const pending = [];
  for (const name of fs.readdirSync(path.join(stage, 'prisma/migrations')).sort()) {
    const file = path.join(stage, 'prisma/migrations', name, 'migration.sql');
    if (!fs.existsSync(file) || applied.has(name)) continue;
    if (!pendingAllowlist.has(name)) throw new Error('Unreviewed pending migration: ' + name);
    const text = fs.readFileSync(file, 'utf8');
    if (/^\s*(?:DROP\s|TRUNCATE\s|DELETE\s|REPLACE\s|INSERT\s|LOAD\s+DATA\s)/im.test(text)) throw new Error('Destructive/seed SQL is forbidden: ' + name);
    pending.push(name);
  }
  console.log(JSON.stringify({ pendingMigrations: pending, preservedHistoricalMigrationNames: missingHistoricalFiles }));
  return pending;
}
function snapshotRows(c) {
  const tables = sql(c, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").split('\n').filter(Boolean).map(s => s.replace(/\r$/, ''));
  const counts = {};
  for (const table of tables) counts[table] = Number(sql(c, 'SELECT COUNT(*) FROM ' + identifier(table) + ';'));
  const permissions = {};
  for (const table of ['rbac_roles', 'rbac_role_permissions', 'rbac_user_roles', 'rbac_user_exceptions']) {
    if (!tables.includes(table)) throw new Error('Missing RBAC table: ' + table);
    permissions[table] = hash(sql(c, 'SELECT * FROM ' + identifier(table) + ' ORDER BY `id`;'));
  }
  return { db: c.db, counts, permissions, envHash: c.envHash };
}
async function backupDatabase(c, snapshot) {
  const file = path.join(snapshot, 'database-before.sql.gz');
  const help = spawnSync(c.dump, ['--help'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (help.error || help.status !== 0) throw new Error('mysqldump is unavailable; update cancelled before changes');
  const extra = [];
  if (help.stdout.includes('no-tablespaces')) extra.push('--no-tablespaces');
  if (help.stdout.includes('set-gtid-purged')) extra.push('--set-gtid-purged=OFF');
  const child = spawn(c.dump, [...c.args, '--single-transaction', '--quick', '--skip-lock-tables', '--hex-blob', '--routines', '--triggers', '--events', ...extra, c.db], { env: c.mysqlEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', b => { stderr = (stderr + b).slice(-10000); });
  const done = new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', resolve); });
  try { await pipeline(child.stdout, zlib.createGzip(), fs.createWriteStream(file, { flags: 'wx', mode: 0o600 })); }
  catch (error) { child.kill(); await done; throw error; }
  if (await done !== 0) throw new Error('Database backup failed; no update allowed: ' + stderr.trim());
  let sawFooter = false;
  const tail = [];
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file).pipe(zlib.createGunzip())) {
    bytes += chunk.length;
    tail.push(chunk);
    while (tail.length > 3) tail.shift();
  }
  sawFooter = Buffer.concat(tail).toString('utf8').includes('-- Dump completed on ');
  if (bytes < 1000000 || !sawFooter) throw new Error('Database backup is incomplete');
  console.log('DATABASE_BACKUP_VERIFIED: ' + file);
}
function compareRows(before, after) {
  if (before.db !== after.db || before.envHash !== after.envHash) throw new Error('Database target or .env changed');
  for (const [table, count] of Object.entries(before.counts)) {
    if (table === '_prisma_migrations') continue;
    if (after.counts[table] === undefined || after.counts[table] < count) throw new Error('Existing table lost rows: ' + table);
  }
  if (JSON.stringify(before.permissions) !== JSON.stringify(after.permissions)) throw new Error('Role/user permission rows changed during update');
}
function runPrisma(c, stage, action) {
  const args = ['validate', 'generate'].includes(action) ? [action] : ['migrate', 'deploy'];
  const result = spawnSync(process.execPath, [path.join(stage, 'node_modules/prisma/build/index.js'), ...args], { cwd: stage, env: { ...process.env, ...c.parsed, DATABASE_URL: c.url.href }, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Prisma ' + action + ' failed; do not continue');
}
async function main() {
  const [action, app, stage, snapshot] = process.argv.slice(2);
  if (action === 'verify-package') return verifyPackage(app);
  if (!app || !stage || !snapshot) throw new Error('Provide action, app directory, staging directory and private snapshot directory');
  const c = config(app, process.argv.includes('--local-test'));
  if (action === 'plan') return migrationPlan(c, stage);
  if (action === 'backup') return backupDatabase(c, snapshot);
  if (action === 'before') {
    const report = snapshotRows(c);
    fs.writeFileSync(path.join(snapshot, 'data-before.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log('DATA_BASELINE_RECORDED: ' + Object.keys(report.counts).length + ' tables');
    return;
  }
  if (action === 'after') {
    const before = JSON.parse(fs.readFileSync(path.join(snapshot, 'data-before.json')));
    const after = snapshotRows(c);
    compareRows(before, after);
    fs.writeFileSync(path.join(snapshot, 'data-after.json'), JSON.stringify(after, null, 2), { mode: 0o600 });
    console.log('EXISTING_ROWS_AND_PERMISSIONS_PRESERVED');
    return;
  }
  if (['validate', 'generate', 'deploy'].includes(action)) return runPrisma(c, stage, action);
  throw new Error('Unsupported action; restoration is not implemented in this update tool');
}
module.exports = { verifyPackage, migrationPlan, snapshotRows, compareRows, config, pendingAllowlist, backupDatabase };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
