const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PrismaClient, Prisma } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/noamany_local_barcode_20261012') throw Error('Isolated local database required');
const p = new PrismaClient();
const quote = (value) => { if (!/^[a-zA-Z0-9_]+$/.test(value)) throw Error('Invalid SQL identifier'); return `\`${value}\``; };
async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../../tmp/local-barcode-schema-diff.sql'), 'utf8').replace(/^--.*$/gm, '');
  const statements = source.split(';').map((statement) => statement.trim()).filter(Boolean);
  const applied = [];
  for (const statement of statements.filter((statement) => /^CREATE TABLE/i.test(statement))) {
    await p.$executeRawUnsafe(statement); applied.push(statement.split('\n')[0]);
  }
  for (const statement of statements.filter((statement) => /^ALTER TABLE/i.test(statement) && /ADD COLUMN/i.test(statement))) {
    const table = statement.match(/^ALTER TABLE `([^`]+)`/)[1];
    const additions = [...statement.matchAll(/ADD COLUMN `[^`]+`[\s\S]*?(?=,\s*(?:ADD COLUMN|MODIFY)|$)/g)].map((match) => match[0]);
    // Preserve historical purchase lines whose inventory-product identity is unknown.
    if (table === 'prc_purchase_invoice_items') additions.forEach((addition, index) => { additions[index] = addition.replace('INTEGER NOT NULL', 'INTEGER NULL'); });
    const sql = `ALTER TABLE ${quote(table)} ${additions.join(', ')}`;
    await p.$executeRawUnsafe(sql); applied.push(sql);
  }
  const columns = await p.$queryRawUnsafe('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,EXTRA,COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  let repaired = 0;
  const identitySql = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    for (const field of model.fields.filter((field) => field.default?.name === 'autoincrement')) {
      const column = columns.find((column) => column.TABLE_NAME === table && column.COLUMN_NAME === (field.dbName || field.name));
      if (!column || /auto_increment/.test(column.EXTRA)) continue;
      if (column.COLUMN_KEY !== 'PRI' || !/^(?:bigint|int|mediumint|smallint|tinyint)(?:\(\d+\))?(?: unsigned)?$/i.test(column.COLUMN_TYPE)) throw Error(`Unsupported identity: ${table}`);
      // Keep the original column type and every existing foreign key/data row.
      const sql = `ALTER TABLE ${quote(table)} MODIFY COLUMN ${quote(column.COLUMN_NAME)} ${column.COLUMN_TYPE} NOT NULL AUTO_INCREMENT`;
      identitySql.push(sql); repaired += 1;
    }
  }
  if (identitySql.length) {
    // A dedicated connection permits identity-only ALTERs on referenced columns.
    // The original column types, relation definitions and row values stay intact.
    const child = spawn('E:/xampp/mysql/bin/mysql.exe', ['--protocol=tcp', '-h', url.hostname,
      '-P', url.port || '3306', '-u', decodeURIComponent(url.username), url.pathname.slice(1)],
    { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let errors = ''; child.stderr.on('data', (data) => { errors += data.toString(); });
    child.stdout.on('data', (data) => process.stdout.write(data));
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(Error(errors.slice(-2000))));
    });
    child.stdin.end("SET SESSION FOREIGN_KEY_CHECKS=0;\nSET SESSION sql_mode=CONCAT(TRIM(BOTH ',' FROM REPLACE(REPLACE(CONCAT(',',@@SESSION.sql_mode,','),',NO_ZERO_DATE,',','),',NO_ZERO_IN_DATE,',',')),',NO_AUTO_VALUE_ON_ZERO');\n" + identitySql.map((sql, index) => sql + ';\n' +
      ((index + 1) % 50 === 0 ? `SELECT 'Restored ${index + 1} identity columns' AS progress;\n` : '')).join('') + 'SET SESSION FOREIGN_KEY_CHECKS=1;\n');
    await done;
  }
  const report = { database: url.pathname.slice(1), additiveChanges: applied, restoredIdentityColumns: repaired };
  fs.writeFileSync(path.join(__dirname, '../../tmp/local-barcode-schema-alignment.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ addedContracts: applied.length, restoredIdentityColumns: repaired }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
