const fs = require('node:fs');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const table = 'legacy_record_mappings';
const statePath = '../output/local-server-import.json';
const contextSql = `SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO'; SET autocommit=0; SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0; SET time_zone='+00:00';
SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT; SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS; SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION; SET NAMES utf8mb4;\n`;

async function main() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state.status !== 'importing' || !/^noamany_server_local_\d+$/.test(state.database)) throw new Error('Expected the active local snapshot import');
  const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find(s => s.startsWith('DATABASE_URL='));
  const url = new URL(line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('Local server required');
  url.pathname = `/${state.database}`; url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const native = (sql, force = false) => new Promise((resolve, reject) => {
    const child = spawn('D:/xampp/mysql/bin/mysql.exe', ['--protocol=TCP', '-h', url.hostname, '-P', url.port || '3306', '-u', decodeURIComponent(url.username), '--default-character-set=utf8mb4', '--binary-mode', ...(force ? ['--force'] : []), state.database], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, windowsHide: true });
    let errors = ''; child.stderr.on('data', d => errors += d.toString()); child.stdout.on('data', () => {});
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(errors.slice(0, 2000))));
    child.stdin.on('error', () => {}); child.stdin.end(contextSql + sql);
  });
  try {
    // Extract only the already-reached AUTO_INCREMENT statement and the following footer.
    let block = '', autoSql = '', suffix = '', collecting = false, inTable = false;
    for await (const line of readline.createInterface({ input: fs.createReadStream(state.source, { encoding: 'utf8', highWaterMark: 1024 * 1024 }), crlfDelay: Infinity })) {
      if (collecting) { suffix += line + '\n'; continue; }
      if (line === `ALTER TABLE \`${table}\``) { inTable = true; block = line + '\n'; continue; }
      if (inTable) {
        block += line + '\n';
        if (/;\s*$/.test(line)) {
          inTable = false;
          if (/MODIFY\s+`id`.+AUTO_INCREMENT/.test(block)) { autoSql = block; suffix = block; collecting = true; }
        }
      }
    }
    if (!autoSql || suffix.length > 5 * 1024 * 1024) throw new Error('Could not identify the exact remaining import footer');
    const active = await db.$queryRawUnsafe('SELECT ID,INFO FROM information_schema.PROCESSLIST WHERE DB=? AND COMMAND=\'Query\'', state.database);
    const original = active.find(r => /^ALTER TABLE `legacy_record_mappings`\s+MODIFY/.test(r.INFO || ''));
    if (!original) throw new Error('Import is no longer at the selected AUTO_INCREMENT statement; leave the original import running');
    await db.$executeRawUnsafe(`KILL QUERY ${Number(original.ID)}`);
    for (let attempt = 0; attempt < 120; attempt++) {
      const remaining = await db.$queryRawUnsafe('SELECT ID FROM information_schema.PROCESSLIST WHERE ID=?', Number(original.ID));
      if (!remaining.length) break;
      if (attempt === 119) throw new Error('Original import connection did not close');
      await new Promise(r => setTimeout(r, 500));
    }
    console.log('Paused the remaining footer at the verified historical-table statement.');
    const create = (await db.$queryRawUnsafe(`SHOW CREATE TABLE \`${table}\``))[0]['Create Table'];
    const definitions = create.split('\n').filter(s => /^\s*(UNIQUE )?KEY `/.test(s)).map(s => s.trim().replace(/,$/, ''));
    const names = definitions.map(s => s.match(/KEY `([^`]+)`/)[1]);
    if (names.length !== 3 || names.some(n => !/^[a-z_]+$/.test(n))) throw new Error('Unexpected historical-table indexes');
    const foreignKeys = await db.$queryRawUnsafe('SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND (TABLE_NAME=? OR REFERENCED_TABLE_NAME=?)', table, table);
    if (foreignKeys.length) throw new Error('Unexpected foreign keys before the final import phase');
    const before = Number((await db.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${table}\``))[0].n);
    const drop = `ALTER TABLE \`${table}\` ${names.map(n => `DROP INDEX \`${n}\``).join(', ')}, ALGORITHM=INPLACE;`;
    const restore = `ALTER TABLE \`${table}\` ${definitions.map(d => 'ADD ' + d).join(', ')}, ALGORITHM=INPLACE;`;
    const backup = { database: state.database, table, rowsBefore: before, indexNames: names, restoreSql: restore, autoSql };
    fs.writeFileSync('../output/local-historical-index-backup.json', JSON.stringify(backup, null, 2));
    let optimizationError;
    try { await native(`LOCK TABLES \`${table}\` WRITE;\n${drop}\n${autoSql}\n${restore}\nUNLOCK TABLES;\nCOMMIT;`, true); }
    catch (error) { optimizationError = error; }
    // --force runs the index restoration and unlock even when an earlier statement fails.
    const currentIndexes = await db.$queryRawUnsafe('SELECT DISTINCT INDEX_NAME n FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', table);
    const missing = definitions.filter((d, i) => !currentIndexes.some(r => r.n === names[i]));
    if (missing.length) await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` ${missing.map(d => 'ADD ' + d).join(', ')}`);
    const after = Number((await db.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${table}\``))[0].n);
    if (after !== before) throw new Error('Historical-table row count changed');
    const extra = await db.$queryRawUnsafe('SELECT EXTRA e FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=\'id\'', table);
    if (!extra[0].e.includes('auto_increment')) { console.log('Using the original AUTO_INCREMENT operation after restoring indexes.'); await native(autoSql); }
    if (optimizationError) console.log('Recovered indexes after a native-client warning.');
    console.log(`Historical table preserved: ${after} rows, all ${names.length} secondary indexes restored.`);
    fs.writeFileSync('../output/local-historical-index-backup.json', JSON.stringify({ ...backup, rowsAfter: after, verified: true }, null, 2));
    console.log('Resuming the original remaining AUTO_INCREMENT statements and foreign keys.');
    suffix = suffix.slice(autoSql.length);
    suffix = suffix.split('\n').map(s => /^\s*[)`]/.test(s) ? s.replaceAll('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci').replaceAll('utf8mb3', 'utf8') : s).join('\n');
    await native(suffix);
    const tables = Number((await db.$queryRawUnsafe('SELECT COUNT(*) n FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()'))[0].n);
    if (tables !== 496) throw new Error(`Unexpected table count: ${tables}`);
    const result = { ...state, status: 'imported', tables, optimizedHistoricalRows: after, completedAt: new Date().toISOString() };
    fs.writeFileSync(statePath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
