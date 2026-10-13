const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const database = 'noamany_local_barcode_20261012';
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Local MySQL required');
const prisma = new PrismaClient();
async function main() {
  const existing = await prisma.$queryRawUnsafe('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', database);
  if (existing.length) throw Error('The isolated database already exists; refusing to replace it');
  await prisma.$executeRawUnsafe(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const child = spawn('E:/xampp/mysql/bin/mysql.exe', [
    '--protocol=tcp', '-h', url.hostname, '-P', url.port || '3306', '-u', decodeURIComponent(url.username),
    '--default-character-set=utf8mb4', database,
  ], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data.toString(); });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(Error(errors.slice(-2000) || `Import failed: ${code}`)));
  });
  child.stdin.write('SET SESSION FOREIGN_KEY_CHECKS=0; SET SESSION UNIQUE_CHECKS=0;\n');
  await Promise.all([completion, pipeline(
    fs.createReadStream(path.join(__dirname, '../backups/noamany-final-new-before-real-import-20261007.sql.gz')),
    zlib.createGunzip(), child.stdin,
  )]);
  console.log(`Restored isolated local database ${database}; original database untouched.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
