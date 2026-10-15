#!/usr/bin/env bash
set -euo pipefail
cd /home/alatheertech/one80.alatheertech.com
node --env-file=.env <<'NODE'
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const base = fs.existsSync('dist/modules/accounting/ledger.service.js') ? 'dist' : 'dist/src';
const load = (p, name) => require(path.resolve(base, p))[name];
const prisma = new PrismaClient();
const Ledger = load('modules/accounting/ledger.service.js', 'LedgerService');
const Accounts = load('modules/accounting/accounts.service.js', 'AccountsService');
const ModuleLedger = load('modules/accounting/module-ledger.service.js', 'ModuleLedgerService');
const Accounting = load('modules/club-subscriptions/club-subscription-accounting.service.js', 'ClubSubscriptionAccountingService');
const Audit = load('common/audit/business-audit.service.js', 'BusinessAuditService');
const Context = load('common/http/request-context.service.js', 'RequestContextService');
const ledger = new Ledger(prisma);
const accounting = new Accounting(new ModuleLedger(ledger, new Accounts(prisma), prisma), ledger, prisma);
const audit = new Audit(prisma, new Context());
const fail = (message) => { throw new Error(message); };
const money = (value) => Math.round(Number(value) * 100) / 100;
const targetPaid = 5000;
async function main() {
  await prisma.$transaction(async (tx) => {
    const members = await tx.club_members.findMany({
      where: { member_code: { in: ['54', '000054', 'A000054'] }, is_deleted: false },
      select: { id: true, member_code: true, name: true },
    });
    if (members.length !== 1) fail('تعذر تحديد العضوية 54 بشكل فريد؛ لم يتم التعديل');
    const member = members[0];
    if (member.id !== 88 || member.member_code !== 'A000054') fail('العضوية لا تطابق سارة A000054');
    const latest = await tx.club_subscriptions.findFirst({
      where: { member_id: member.id }, orderBy: { id: 'desc' },
    });
    if (!latest) fail('لا يوجد اشتراك للعضوية');
    const lock = `club_sub_pay_${latest.id}`;
    const result = await tx.$queryRaw`SELECT GET_LOCK(${lock}, 10) AS acquired`;
    if (Number(result[0].acquired) !== 1) fail('تعذر حجز الاشتراك للتعديل');
    try {
      await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${latest.id} FOR UPDATE`;
      const sub = await tx.club_subscriptions.findUnique({
        where: { id: latest.id }, include: { receipts: { include: { payments: true } }, refunds: true },
      });
      console.log(JSON.stringify({ member, subscription: sub.subscription_number, paid: sub.paid_amount, status: sub.status }, null, 2));
      if (sub.subscription_number !== 'A000054-2' || !['active', 'upcoming'].includes(sub.status)) fail('الاشتراك لا يطابق التجديد المطلوب A000054-2');
      const oldPaid = money(sub.paid_amount);
      if (![5000, 7500].includes(oldPaid)) fail('المدفوع الحالي ليس 5000 أو 7500');
      if (sub.discount_enabled || money(sub.discount_value) || money(sub.waived_amount) || money(sub.transferred_credit_amount) || money(sub.transferred_out_amount) || sub.refunds.length) fail('توجد خصومات أو إعفاءات أو تحويلات أو استردادات؛ يلزم تحديد التصحيح');
      if (sub.receipts.length !== 1 || sub.receipts[0].payments.length !== 1) fail('يلزم إيصال واحد بطريقة دفع واحدة لتحديد المبلغ دون تخمين');
      const receipt = sub.receipts[0], payment = receipt.payments[0];
      const oldReceipt = money(receipt.amount);
      if (![5000, 7500].includes(oldReceipt) || money(payment.amount) !== oldReceipt || receipt.status !== 'مدفوعة') fail('الإيصال أو طريقة الدفع لا يطابقان المبلغ المتوقع');
      const remaining = money(money(sub.subscription_value) - targetPaid);
      if (remaining < 0 || money(sub.remaining_amount) !== money(money(sub.subscription_value) - oldPaid)) fail('قيمة الاشتراك أو المتبقي لا يسمحان بهذا التصحيح');
      const entries = await tx.acc_journal_entries.findMany({ where: {
        source_module: 'club', source_doc_type: { in: ['receipt', 'subscription'] },
        source_doc_id: { in: [receipt.receipt_number, `${receipt.receipt_number}-FIX54`, `${receipt.receipt_number}-FIX54-5000`] }, status: 'posted',
      }, include: { lines: true } });
      if (entries.length !== 1 || money(entries[0].total_debit) !== oldReceipt || money(entries[0].total_credit) !== oldReceipt) fail('القيد الأصلي لا يطابق الإيصال؛ لم يتم التعديل');
      if (oldPaid === targetPaid && oldReceipt === targetPaid) {
        console.log('تم التحقق: المدفوع والإيصال والمحاسبة جميعها 5000؛ لا حاجة للتعديل');
        return;
      }
      const actor = receipt.created_by ?? sub.created_by;
      if (!actor) fail('لا يوجد مستخدم مسجل للإيصال أو الاشتراك');
      const backup = path.resolve(`member-54-renewal-before-${Date.now()}.json`);
      fs.writeFileSync(backup, JSON.stringify({ member, sub, entries }, null, 2), { mode: 0o600, flag: 'wx' });
      console.log(`نسخة البيانات قبل التعديل: ${backup}`);
      const reason = 'تصحيح المدفوع في تجديد العضوية 54 من 7500 إلى 5000';
      if (oldReceipt !== targetPaid) await accounting.reverseReceiptEntry(entries[0].source_doc_id, reason, actor, tx);
      await tx.club_subscriptions.update({ where: { id: sub.id }, data: { paid_amount: targetPaid, remaining_amount: remaining } });
      await tx.club_receipts.update({ where: { id: receipt.id }, data: { amount: targetPaid } });
      await tx.club_receipt_payments.update({ where: { id: payment.id }, data: { amount: targetPaid } });
      if (oldReceipt !== targetPaid) await accounting.postJournal({
        subscriptionNumber: sub.subscription_number, sourceDocId: `${receipt.receipt_number}-FIX54-5000`,
        paidAmount: targetPaid, subscriptionValue: money(sub.subscription_value), discountValue: 0,
        discountEnabled: false, paymentMethod: payment.method, branchId: sub.branch_id,
        createdBy: actor, registrationDate: receipt.receipt_date, kind: 'renewal',
      }, tx);
      await audit.log({ entityType: 'club_subscription', entityId: sub.id, action: 'manual_correction',
        actorUserId: actor, branchId: sub.branch_id, reason,
        before: { paid_amount: oldPaid, receipt_amount: oldReceipt, remaining_amount: money(sub.remaining_amount) },
        after: { paid_amount: targetPaid, receipt_amount: targetPaid, remaining_amount: remaining },
      }, tx);
      return { member: member.member_code, name: member.name, paid: targetPaid, remaining };
    } finally { await tx.$queryRaw`SELECT RELEASE_LOCK(${lock})`; }
  }, { timeout: 60000 }).then((result) => { if (result) console.log('تم التصحيح بنجاح:', result); });
}
main().catch((error) => { console.error('لم يتم تطبيق التصحيح:', error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
NODE
