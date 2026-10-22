const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const database = process.argv[2];
  if (!/^noamany_server_local_\d+$/.test(database || '')) throw new Error('Expected an isolated local snapshot database');
  const imported = JSON.parse(fs.readFileSync('../output/local-server-import.json', 'utf8'));
  if (imported.database !== database || imported.status !== 'imported') throw new Error('A successful completed import is required');
  let envText = fs.readFileSync('.env', 'utf8');
  const line = envText.split(/\r?\n/).find(s => s.startsWith('DATABASE_URL='));
  const url = new URL(line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('Local server required');
  url.pathname = `/${database}`;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const tables = await db.$queryRawUnsafe('SELECT COUNT(*) n FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
    if (Number(tables[0].n) < 400) throw new Error('Snapshot import is incomplete');
    const additions = [
      ['inv_transactions', 'recipient_name', 'VARCHAR(200) NULL'],
      ['inv_transactions', 'cafe_category_id', 'INTEGER NULL'],
      ['inv_transactions', 'gender', "ENUM('male','female') NULL"],
      ['prc_purchase_returns', 'supplier_invoice_id', 'INTEGER NULL'],
      ['prc_supplier_invoices', 'returned_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0'],
      ['prc_supplier_invoices', 'is_opening_balance', 'BOOLEAN NOT NULL DEFAULT false'],
    ];
    let addedColumns = 0;
    for (const [table, column, definition] of additions) {
      const found = await db.$queryRawUnsafe('SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', table, column);
      if (!found.length) { await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`); addedColumns++; }
    }
    const indexName = 'prc_purchase_returns_supplier_invoice_id_idx';
    const index = await db.$queryRawUnsafe('SELECT INDEX_NAME FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?', 'prc_purchase_returns', indexName);
    if (!index.length) await db.$executeRawUnsafe(`CREATE INDEX \`${indexName}\` ON prc_purchase_returns(supplier_invoice_id)`);
    const name = 'local.admin';
    let account = await db.users.findFirst({ where: { username: name } });
    if (!account) {
      const password = `Local!${randomBytes(8).toString('hex')}`;
      account = await db.users.create({ data: { username: name, name: 'مدير النسخة المحلية', password: await bcrypt.hash(password, 12), level: 1, branch_id_fk: 0, approved: 1 } });
      console.log(JSON.stringify({ localUsername: name, localPassword: password }));
    }
    envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${url.toString()}"`);
    const settings = { PORT: '4002', HOST: '127.0.0.1', NODE_ENV: 'development', REDIS_URL: '""', CORS_ORIGINS: '"http://localhost:5173,http://127.0.0.1:5173,http://localhost:5175,http://127.0.0.1:5175"', DISABLE_SCHEDULED_TASKS: 'true' };
    for (const [key, value] of Object.entries(settings)) {
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      envText = pattern.test(envText) ? envText.replace(pattern, `${key}=${value}`) : `${envText.trimEnd()}\n${key}=${value}\n`;
    }
    fs.writeFileSync('.env', envText);
    console.log(JSON.stringify({ database, tables: Number(tables[0].n), addedColumns, localUserId: account.user_id, originalUsersPreserved: true, scheduledTasks: 'disabled locally' }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
