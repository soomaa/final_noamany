// Add only the columns required by daily employee allowances. Safe to rerun.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const additions = [
    ['sales_quick_sales', 'employee_benefit_date', 'VARCHAR(10) NULL'],
    ['sales_quick_sales', 'employee_free_drinks', 'INT NOT NULL DEFAULT 0'],
    ['sales_quick_sale_items', 'free_quantity', 'INT NOT NULL DEFAULT 0'],
  ];
  for (const [table, column, definition] of additions) {
    const rows = await prisma.$queryRaw`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`;
    if (!rows.length) await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
  const indexes = await prisma.$queryRaw`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quick_sales' AND INDEX_NAME = 'idx_employee_daily_drinks'`;
  if (!indexes.length) await prisma.$executeRawUnsafe('CREATE INDEX idx_employee_daily_drinks ON sales_quick_sales(employee_id, employee_benefit_date, status)');
  console.log('Daily employee allowance columns are ready.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
