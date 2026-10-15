'use strict';
// Retires the "daily" collection cycle for existing invoices: every employee/partner invoice that is
// still uncollected (not in any statement, not reserved for payroll) and marked daily becomes
// monthly, so the monthly statement and the payroll deduction pick it up.
// Invoices already inside an issued daily statement are left as they are (settle that statement).
// Default = read-only preview. Pass --apply to change them.
// Usage: node convert-daily-billing-to-monthly.cjs APP_DIR [--apply]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const apply = process.argv.includes('--apply');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const REF = 'retire-daily-billing-cycle';

const eligibleWhere = {
  billing_cycle: 'daily',
  sale_type: { in: ['employee', 'partner'] },
  OR: [
    { status: 'completed', billing_status: 'unbilled' },
    { status: 'draft' },
  ],
  billing_statement_item: null,
};

async function snapshot(client) {
  const rows = await client.sales_quick_sales.findMany({
    where: eligibleWhere,
    select: { id: true, sale_number: true, sale_date: true, sale_type: true, status: true, employee_id: true, partner_id: true, total_amount: true },
    orderBy: { id: 'asc' },
  });
  const reserved = rows.length ? await client.payroll_cafe_allocations.findMany({ where: { sale_id: { in: rows.map((r) => r.id) } }, select: { sale_id: true } }) : [];
  const reservedIds = new Set(reserved.map((r) => r.sale_id));
  return rows.filter((r) => !reservedIds.has(r.id));
}

async function main() {
  const rows = await snapshot(p);
  const [employees, partners, inDailyStatements] = await Promise.all([
    p.employees.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] } }, select: { id: true, employee: true, emp_code: true } }),
    p.cafe_partners.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partner_id).filter(Boolean))] } }, select: { id: true, name: true } }),
    p.sales_quick_sales.count({ where: { billing_cycle: 'daily', billing_status: 'in_statement' } }),
  ]);
  const accountName = (r) => r.sale_type === 'employee'
    ? (employees.find((e) => e.id === r.employee_id)?.employee ?? `موظف #${r.employee_id}`)
    : (partners.find((x) => x.id === r.partner_id)?.name ?? `شريك #${r.partner_id}`);
  const byAccount = {};
  for (const r of rows) {
    const k = `${r.sale_type === 'employee' ? 'موظف' : 'شريك'}: ${accountName(r)}`;
    byAccount[k] = byAccount[k] ?? { invoices: 0, total: 0, sales: [] };
    byAccount[k].invoices += 1;
    byAccount[k].total = Math.round((byAccount[k].total + Number(r.total_amount)) * 100) / 100;
    byAccount[k].sales.push(`${r.sale_number} (${r.sale_date}) ${Number(r.total_amount)}${r.status === 'draft' ? ' مسودة' : ''}`);
  }
  const report = {
    mode: apply ? 'apply' : 'preview',
    invoicesToConvert: rows.length,
    byAccount,
    leftAsIs_inIssuedDailyStatements: inDailyStatements,
  };
  if (!apply) return report;
  if (!rows.length) return { ...report, converted: 0 };

  const converted = await p.$transaction(async (tx) => {
    const ids = rows.map((r) => r.id).sort((a, b) => a - b);
    await tx.$queryRawUnsafe(`SELECT id FROM sales_quick_sales WHERE id IN (${ids.join(',')}) ORDER BY id FOR UPDATE`);
    const current = (await snapshot(tx)).map((r) => r.id).filter((id) => ids.includes(id));
    if (!current.length) return 0;
    const res = await tx.sales_quick_sales.updateMany({ where: { id: { in: current }, billing_cycle: 'daily' }, data: { billing_cycle: 'monthly' } });
    await tx.sales_invoice_events.createMany({
      data: current.map((id) => ({ quick_sale_id: id, event_type: 'billing_cycle_changed', notes: 'دورة التجميع اتغيرت من يومي إلى شهري (إلغاء التجميع اليومي)' })),
    });
    await tx.business_audit_log.create({ data: {
      entity_type: 'sales_billing_cycle', entity_id: REF, action: 'billing_cycle.daily_to_monthly',
      actor_name: 'one80 maintenance', before_json: { daily: current }, after_json: { monthly: current, count: res.count },
      changed_fields: current.map((id) => `sale:${id}`),
      reason: 'Daily collection cycle retired at the owner\'s request; uncollected daily invoices moved to monthly so the monthly statement includes them',
    } });
    return res.count;
  });
  return { ...report, converted };
}
main().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
