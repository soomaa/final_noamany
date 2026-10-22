// Import a server snapshot into a fresh LOCAL database; never reset existing data.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const source = process.argv[2];
  if (!source || !fs.statSync(source).isFile()) throw new Error('SQL dump file required');
  const envLine = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find(s => s.startsWith('DATABASE_URL='));
  const url = new URL(envLine.slice(envLine.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('Local MySQL only');
  const target = `noamany_server_local_${Date.now()}`;
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const mysql = 'D:/xampp/mysql/bin/mysql.exe';
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const originalPacketRows = await admin.$queryRawUnsafe('SELECT @@GLOBAL.max_allowed_packet AS packet_size');
  const originalPacket = Number(originalPacketRows[0].packet_size);
  await admin.$executeRawUnsafe('SET GLOBAL max_allowed_packet = 1073741824');
  const child = spawn(mysql, ['--protocol=TCP', '--host', url.hostname, '--port', url.port || '3306', '--user', decodeURIComponent(url.username), '--default-character-set=utf8mb4', '--binary-mode', '--max-allowed-packet=1G', target], {
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', d => { errors += d.toString(); });
  child.stdout.on('data', () => {});
  const completion = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`mysql import failed (${code}): ${errors.slice(0, 2000)}`))); });
  // Attach immediately so an early SQL error does not cause an unhandled rejection.
  completion.catch(() => {});
  let bytes = 0, carry = '', replacements = 0, lastProgress = Date.now();
  const total = fs.statSync(source).size;
  const transformLine = line => {
    if (/^\s*(USE\s|CREATE\s+DATABASE|DROP\s+DATABASE)/i.test(line)) throw new Error('Dump contains database switching commands');
    // Adapt only schema definitions for local MariaDB 10.4; never rewrite stored data.
    if (/^\s*[)`]/.test(line)) {
      line = line.replace(/utf8mb4_0900_ai_ci/g, () => { replacements++; return 'utf8mb4_unicode_ci'; });
      line = line.replace(/utf8mb3/g, 'utf8');
    }
    return line;
  };
  const normalize = new Transform({
    transform(chunk, enc, callback) {
      try {
        bytes += chunk.length;
        const lines = (carry + chunk.toString('utf8')).split('\n'); carry = lines.pop();
        callback(null, lines.map(transformLine).join('\n') + '\n');
        if (Date.now() - lastProgress > 15000) { console.log(`Read ${Math.floor(bytes / total * 100)}% of SQL dump`); lastProgress = Date.now(); }
      } catch (e) { callback(e); }
    },
    flush(callback) { try { callback(null, transformLine(carry)); } catch (e) { callback(e); } },
  });
  // StringDecoder in the source preserves Arabic characters across chunk boundaries.
  const sourceStream = fs.createReadStream(source, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
  child.stdin.write('SET autocommit=0; SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0;\n');
  fs.mkdirSync(path.resolve('..', 'output'), { recursive: true });
  const statePath = path.resolve('..', 'output', 'local-server-import.json');
  fs.writeFileSync(statePath, JSON.stringify({ database: target, source, status: 'importing', startedAt: new Date().toISOString() }, null, 2));
  console.log(`Importing snapshot into ${target}`);
  try {
    await pipeline(sourceStream, normalize, child.stdin);
    await completion;
    url.pathname = `/${target}`;
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const tables = await db.$queryRawUnsafe('SELECT count(*) AS n FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
    const result = { database: target, source, status: 'imported', tables: Number(tables[0].n), schemaCollationAdaptations: replacements, completedAt: new Date().toISOString() };
    fs.writeFileSync(statePath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    await db.$disconnect();
  } catch (e) { child.kill(); throw e; }
  finally {
    await admin.$executeRawUnsafe(`SET GLOBAL max_allowed_packet = ${originalPacket}`);
    await admin.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
