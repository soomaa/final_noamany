import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
if (database !== 'noamany_final_new') throw new Error('Unexpected target database');

function mysql(sql) {
  const result = spawnSync('C:/xampp/mysql/bin/mysql.exe', [
    '--host', url.hostname, '--port', url.port || '3306',
    '--user', decodeURIComponent(url.username), '--database', database,
    '--execute', sql,
  ], {
    encoding: 'utf8',
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `mysql exit ${result.status}`);
}

try {
  const rows = await p.$queryRawUnsafe('SELECT COALESCE(MAX(id),0)+1 n FROM legacy_record_mappings');
  const start = Number(rows[0].n);
  if (!Number.isSafeInteger(start) || start < 1) throw new Error('Invalid sequence start');
  mysql(`CREATE SEQUENCE IF NOT EXISTS legacy_record_mapping_seq_20261007 START WITH ${start} INCREMENT BY 1`);
  mysql(`CREATE TRIGGER legacy_record_mappings_autonumber_20261007 BEFORE INSERT ON legacy_record_mappings FOR EACH ROW SET NEW.id = IF(NEW.id IS NULL OR NEW.id=0, NEXT VALUE FOR legacy_record_mapping_seq_20261007, NEW.id)`);
  console.log(`Temporary migration numbering installed from ${start}`);
} finally {
  await p.$disconnect();
}
