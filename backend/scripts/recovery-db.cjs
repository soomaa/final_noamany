const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const database = process.env.NOAMANY_LOCAL_TEST_DATABASE || 'noamany_recovery_20260930_20261001';
if (!['noamany_recovery_20260930_20261001', 'noamany_update_20261001_current'].includes(database)) throw new Error('Only the two isolated local test databases are allowed');
const currentData = database === 'noamany_update_20261001_current';
const output = path.resolve(root, currentData ? '../output/update-20261001' : '../output/recovery-20261001');
const backup = path.resolve(process.env.NOAMANY_LOCAL_TEST_BACKUP || process.argv[3] || (currentData ? 'C:/Users/qqqqq/Downloads/noamanycenter_nest (2).sql' : 'C:/Users/qqqqq/Downloads/noamanycenter_nest_20260930_131249.sql.gz'));
function backupInput() {
  const input = fs.createReadStream(backup);
  return backup.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
}
const live = new URL(dotenv.parse(fs.readFileSync(path.join(root, '.env'))).DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(live.hostname)) throw new Error('Local recovery requires a loopback MySQL server');
const target = new URL(live.href);
target.pathname = '/' + database;
const mysql = 'E:/xampp/mysql/bin/mysql.exe';
const args = ['--protocol=TCP', '--host=' + target.hostname, '--port=' + (target.port || '3306'), '--user=' + decodeURIComponent(target.username), '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names'];
const mysqlEnv = { ...process.env, MYSQL_PWD: decodeURIComponent(target.password) };
function sql(statement, db) {
  const result = spawnSync(mysql, [...args, ...(db ? [db] : []), '-e', statement], { env: mysqlEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || 'MySQL command failed').trim());
  return result.stdout.trim();
}
function quote(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('Invalid database identifier');
  return '`' + name + '`';
}
async function inspect() {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(backup)) hash.update(chunk);
  const stream = backupInput();
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let bytes = 0;
  let tableCount = 0;
  let complete = false;
  const tables = [];
  for await (const line of reader) {
    bytes += Buffer.byteLength(line) + 1;
    const m = /^CREATE TABLE `([^`]+)`/.exec(line);
    if (m) { tables.push(m[1]); tableCount++; }
    if (/^\s*(?:USE\s|CREATE\s+DATABASE\s)/i.test(line)) throw new Error('Dump changes database context; review required before import');
    if (/^-- Dump completed on /.test(line) || (currentData && /^COMMIT;\s*$/.test(line))) complete = true;
  }
  if (!complete || tableCount < 100) throw new Error('Backup is incomplete or is not the expected full application dump');
  fs.mkdirSync(output, { recursive: true });
  const report = { backup, bytes: fs.statSync(backup).size, sha256: hash.digest('hex'), uncompressedBytes: bytes, tableCount, complete, tables };
  fs.writeFileSync(path.join(output, 'backup-inspection.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ sha256: report.sha256, tableCount, complete, uncompressedBytes: bytes }));
}
async function restore() {
  await inspect();
  if (decodeURIComponent(live.pathname.slice(1)) === database) throw new Error('Recovery target must differ from the configured database');
  const exists = sql("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='" + database + "';");
  if (exists !== '0') throw new Error('Recovery database already exists; refusing to overwrite it');
  sql('CREATE DATABASE ' + quote(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  const child = spawn(mysql, [...args, '--binary-mode', database], { env: mysqlEnv, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c.toString(); });
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || 'MySQL import failed')));
  });
  // Attach the failure handler immediately so a failed import cannot become an
  // unhandled rejection while the input stream is still being consumed.
  let importFailure;
  finished.catch((e) => { importFailure = e; });
  const reader = readline.createInterface({ input: backupInput(), crlfDelay: Infinity });
  let ddl = false;
  let adaptedLines = 0;
  for await (let line of reader) {
    if (importFailure) throw importFailure;
    if (/^CREATE TABLE /.test(line)) ddl = true;
    if (ddl) {
      const adapted = line.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci').replace(/utf8mb4_0900_bin/g, 'utf8mb4_bin');
      if (adapted !== line) adaptedLines++;
      line = adapted;
    }
    if (!child.stdin.write(line + '\n')) await once(child.stdin, 'drain');
    if (ddl && /^\) .*;\s*$/.test(line)) ddl = false;
  }
  child.stdin.end();
  await finished;
  console.log(JSON.stringify({ restoredDatabase: database, tables: Number(sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();', database)), adaptedLocalCollationLines: adaptedLines }));
}
async function audit() {
  const { Prisma, PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: target.href } } });
  try {
    const columns = await client.$queryRawUnsafe('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
    const byTable = new Map();
    for (const c of columns) {
      if (!byTable.has(c.TABLE_NAME)) byTable.set(c.TABLE_NAME, new Map());
      byTable.get(c.TABLE_NAME).set(c.COLUMN_NAME, c);
    }
    const missingTables = [];
    const missingColumns = [];
    const autoIncrementDifferences = [];
    const failures = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName || model.name;
      const cols = byTable.get(table);
      if (!cols) { missingTables.push(table); continue; }
      for (const field of model.fields.filter((f) => f.kind !== 'object')) {
        const name = field.dbName || field.name;
        if (!cols.has(name)) missingColumns.push({ model: model.name, table, field: field.name, column: name, type: field.type });
        else if (field.default?.name === 'autoincrement' && !cols.get(name).EXTRA.includes('auto_increment')) autoIncrementDifferences.push({ table, column: name });
      }
      try { await client[model.name].findMany({ take: 1 }); }
      catch (e) { failures.push({ model: model.name, code: e.code || e.name, message: e.message.slice(-700) }); }
    }
    const important = ['users','rbac_roles','rbac_role_permissions','rbac_user_roles','rbac_user_exceptions','employees','club_members','club_subscriptions','club_receipts','club_receipt_payments','sales_quick_sales','acc_journal_entries'];
    const counts = {};
    for (const table of important) if (byTable.has(table)) counts[table] = Number((await client.$queryRawUnsafe('SELECT COUNT(*) AS n FROM ' + quote(table)))[0].n);
    const permissionFingerprints = {};
    for (const table of ['rbac_roles','rbac_role_permissions','rbac_user_roles','rbac_user_exceptions']) {
      if (!byTable.has(table)) continue;
      const rows = await client.$queryRawUnsafe('SELECT * FROM ' + quote(table) + ' ORDER BY ' + (byTable.get(table).has('id') ? '`id`' : '`user_id`'));
      permissionFingerprints[table] = crypto.createHash('sha256').update(JSON.stringify(rows, (_k,v) => typeof v === 'bigint' ? v.toString() : v)).digest('hex');
    }
    const migrations = await client.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at');
    const report = { database, counts, permissionFingerprints, missingTables, missingColumns, autoIncrementDifferences, modelReadFailures: failures, migrations };
    fs.mkdirSync(output, { recursive: true });
    const stamp = process.argv[3] || 'before';
    if (!/^[a-z0-9-]+$/i.test(stamp)) throw new Error('Invalid audit label');
    fs.writeFileSync(path.join(output, 'database-audit-' + stamp + '.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ database, counts, missingTables, missingColumns, autoIncrementDifferences: autoIncrementDifferences.length, modelReadFailures: failures.length }));
  } finally { await client.$disconnect(); }
}
async function dumpContract() {
  const { Prisma } = require('@prisma/client');
  const tables = new Map();
  const tableBytes = {};
  let dataTable;
  let table;
  const reader = readline.createInterface({ input: backupInput(), crlfDelay: Infinity });
  for await (const line of reader) {
    const section = /^-- Table structure for table `([^`]+)`/.exec(line);
    if (section) dataTable = section[1];
    if (dataTable) tableBytes[dataTable] = (tableBytes[dataTable] || 0) + Buffer.byteLength(line) + 1;
    const start = /^CREATE TABLE `([^`]+)`/.exec(line);
    if (start) { table = start[1]; tables.set(table, new Set()); }
    if (table) {
      const col = /^\s+`([^`]+)`\s/.exec(line);
      if (col) tables.get(table).add(col[1]);
      if (/^\) .*;\s*$/.test(line)) table = undefined;
    }
  }
  const missingTables = [], missingColumns = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const name = model.dbName || model.name;
    const columns = tables.get(name);
    if (!columns) { missingTables.push(name); continue; }
    for (const f of model.fields.filter(f => f.kind !== 'object')) {
      const column = f.dbName || f.name;
      if (!columns.has(column)) missingColumns.push({ table: name, field: f.name, column, type: f.type, required: f.isRequired });
    }
  }
  fs.mkdirSync(output, { recursive: true });
  const report = { tables: tables.size, missingTables, missingColumns, tableBytes };
  fs.writeFileSync(path.join(output, 'dump-contract.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
async function migrationStatus() {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'status'], {
    cwd: root, env: { ...process.env, DATABASE_URL: target.href }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  console.log(result.stdout);
  console.error(result.stderr);
  process.exitCode = result.status || 0;
}
function requireCompleteIdleRecovery() {
  const count = Number(sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();', database));
  if (count < 464) throw new Error('Full backup import has not completed');
  const active = Number(sql('SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID() AND COMMAND<>\'Sleep\';', database));
  if (active) throw new Error('Recovery database still has active work; wait for the import/check to complete');
}
async function migrateLocal() {
  requireCompleteIdleRecovery();
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: root, env: { ...process.env, DATABASE_URL: target.href }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(output, 'migration-deploy-local.log'), result.stdout + result.stderr);
  console.log(result.stdout); console.error(result.stderr);
  if (result.status !== 0) throw new Error('Local migration deploy failed; no automatic resolve/healing is permitted');
}
async function applyLocalCandidate() {
  requireCompleteIdleRecovery();
  const text = fs.readFileSync(path.join(output, 'additive-recovery-candidate.sql'), 'utf8');
  if (/\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|FROM)\b/i.test(text)) throw new Error('Destructive SQL is forbidden');
  const result = spawnSync(mysql, [...args, database], { env: mysqlEnv, input: text, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, 'additive-recovery-local.log'), result.stdout + result.stderr);
  if (result.status !== 0) throw new Error(result.stderr || 'Local candidate failed');
  console.log('Additive candidate applied only to isolated local database');
}
const modes = { inspect, 'restore-local': restore, audit, 'dump-contract': dumpContract, 'migration-status': migrationStatus, 'migrate-local': migrateLocal, 'apply-local-candidate': applyLocalCandidate };
modes['boost-local-buffer'] = async () => {
  const state = path.join(output, 'local-buffer-original.json');
  fs.mkdirSync(output, { recursive: true });
  if (!fs.existsSync(state)) fs.writeFileSync(state, JSON.stringify({ bytes: Number(sql('SELECT @@innodb_buffer_pool_size;')), host: target.hostname, port: target.port || '3306' }, null, 2));
  sql('SET GLOBAL innodb_buffer_pool_size=268435456;');
  console.log('Local buffer requested: 256 MiB; original recorded for restoration');
};
modes['restore-local-buffer'] = async () => {
  const state = JSON.parse(fs.readFileSync(path.join(output, 'local-buffer-original.json')));
  if (state.host !== target.hostname || state.port !== (target.port || '3306') || !Number.isSafeInteger(state.bytes) || state.bytes <= 0) throw new Error('Invalid local buffer restoration target');
  sql('SET GLOBAL innodb_buffer_pool_size=' + state.bytes + ';');
  console.log('Original local buffer requested: ' + state.bytes + ' bytes');
};
modes['business-dates'] = async () => {
  for (const [table, column] of [['club_subscriptions','registration_date'],['club_receipts','receipt_date'],['sales_quick_sales','sale_date']]) {
    console.log(table + ': ' + sql('SELECT MIN(' + quote(column) + '),MAX(' + quote(column) + ') FROM ' + quote(table) + ';', database));
  }
  console.log('Local buffer bytes: ' + sql('SELECT @@innodb_buffer_pool_size;'));
};
modes.status = async () => {
  console.log('Imported tables: ' + sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + database + "';"));
  console.log(sql("SELECT COMMAND,TIME,STATE,LENGTH(INFO) AS statement_bytes,CASE WHEN INFO LIKE 'INSERT INTO `% THEN%' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(INFO,'`',2),'`',-1) WHEN INFO LIKE 'INSERT INTO `%`%' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(INFO,'`',2),'`',-1) ELSE COMMAND END AS operation_table FROM information_schema.PROCESSLIST WHERE DB='" + database + "';"));
};
const action = modes[process.argv[2]];
if (!action) throw new Error('Choose inspect, restore-local, or audit');
action().catch((e) => { console.error(e.message); process.exitCode = 1; });
