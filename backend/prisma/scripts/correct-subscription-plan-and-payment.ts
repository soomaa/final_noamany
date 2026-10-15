/**
 * One-off correction for a subscription created with the wrong plan/price
 * (e.g. reception picked "VIP month" at 2500 instead of the regular month
 * at 1800 because of a lagging connection). Rewrites the subscription,
 * its receipt, and its single payment row to the correct plan/value, then
 * reverses the original GL posting and reposts the corrected one — the
 * same reverse+repost pattern the app itself uses (see
 * ClubSubscriptionAccountingService.reverseReceiptEntry / postJournal).
 *
 * This script only corrects DATA. It does not move real money — if the
 * member actually handed over the higher amount, the cash/card difference
 * must still be refunded to them separately, outside this script.
 *
 * Usage (dry run by default — no writes happen without --apply):
 *   npx ts-node prisma/scripts/correct-subscription-plan-and-payment.ts \
 *     --member=A000458 --new-value=1800 --actor-user-id=3
 *
 *   (no --target-type-id yet -> prints candidate plans for that branch, then exits)
 *
 *   npx ts-node prisma/scripts/correct-subscription-plan-and-payment.ts \
 *     --member=A000458 --target-type-id=12 --new-value=1800 \
 *     --expected-old-value=2500 --actor-user-id=3 --apply
 */
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { LedgerService } from '../../src/modules/accounting/ledger.service';
import { AccountsService } from '../../src/modules/accounting/accounts.service';
import { ModuleLedgerService } from '../../src/modules/accounting/module-ledger.service';
import { ClubSubscriptionAccountingService } from '../../src/modules/club-subscriptions/club-subscription-accounting.service';
import { BusinessAuditService } from '../../src/common/audit/business-audit.service';
import { RequestContextService } from '../../src/common/http/request-context.service';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const memberCode = arg('member');
  const targetTypeId = arg('target-type-id') ? Number(arg('target-type-id')) : undefined;
  const expectedOldValue = arg('expected-old-value') ? Number(arg('expected-old-value')) : undefined;
  const newValue = arg('new-value') ? Number(arg('new-value')) : undefined;
  const actorUserId = arg('actor-user-id') ? Number(arg('actor-user-id')) : 0;
  const reason = arg('reason') ?? 'تصحيح خطأ إدخال بسبب تعليق الشبكة أثناء إنشاء الاشتراك';
  const apply = process.argv.includes('--apply');

  if (!memberCode || !newValue) {
    console.error(
      'usage: --member=<code> --new-value=<correct price> [--target-type-id=<id>] [--expected-old-value=<n>] [--actor-user-id=<n>] [--reason="..."] [--apply]',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const member = await prisma.club_members.findFirst({
      where: { member_code: memberCode },
      select: { id: true, name: true, branch_id: true },
    });
    if (!member) throw new Error(`Member ${memberCode} not found`);

    const subs = await prisma.club_subscriptions.findMany({
      where: { member_id: member.id, status: 'active' },
      include: { receipts: { include: { payments: true } } },
      orderBy: { id: 'desc' },
    });

    if (subs.length !== 1) {
      console.log(
        JSON.stringify(
          {
            error: 'Safety check failed: expected exactly one active subscription for this member.',
            found: subs.map((s) => ({
              id: s.id,
              subscription_number: s.subscription_number,
              subscription_type: s.subscription_type,
              subscription_value: s.subscription_value,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    const sub = subs[0];

    if (expectedOldValue != null && Number(sub.subscription_value) !== expectedOldValue) {
      console.log(
        JSON.stringify(
          {
            error: 'Safety check failed: current subscription_value does not match --expected-old-value.',
            current: sub.subscription_value,
            expected: expectedOldValue,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (sub.discount_enabled) {
      console.log(
        JSON.stringify({ error: 'Subscription has a discount applied — needs manual review, script refuses to guess.' }, null, 2),
      );
      return;
    }

    if (Number(sub.paid_amount) !== Number(sub.subscription_value)) {
      console.log(
        JSON.stringify(
          {
            error: 'Subscription is not fully paid (paid_amount != subscription_value) — needs manual review.',
            paid_amount: sub.paid_amount,
            subscription_value: sub.subscription_value,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (sub.receipts.length !== 1 || sub.receipts[0].payments.length !== 1) {
      console.log(
        JSON.stringify(
          {
            error: 'Safety check failed: expected exactly one receipt with exactly one payment row.',
            receiptsCount: sub.receipts.length,
            paymentsCount: sub.receipts[0]?.payments.length,
          },
          null,
          2,
        ),
      );
      return;
    }
    const receipt = sub.receipts[0];
    const payment = receipt.payments[0];

    if (!targetTypeId) {
      const candidates = await prisma.club_subscription_types.findMany({
        where: { branch_id: member.branch_id },
        select: { id: true, name: true, price: true },
        orderBy: { name: 'asc' },
      });
      console.log(
        JSON.stringify(
          { info: 'Pass --target-type-id=<id> to select the correct plan for this branch.', candidates },
          null,
          2,
        ),
      );
      return;
    }
    const targetType = await prisma.club_subscription_types.findUnique({ where: { id: targetTypeId } });
    if (!targetType) throw new Error(`target-type-id ${targetTypeId} not found`);
    if (targetType.branch_id !== member.branch_id) {
      console.log(
        JSON.stringify(
          { error: 'Target plan belongs to a different branch than the member.', planBranch: targetType.branch_id, memberBranch: member.branch_id },
          null,
          2,
        ),
      );
      return;
    }

    const before = {
      subscription: {
        subscription_value: sub.subscription_value,
        subscription_type: sub.subscription_type,
        subscription_type_id: sub.subscription_type_id,
        paid_amount: sub.paid_amount,
        remaining_amount: sub.remaining_amount,
      },
      receipt: { receipt_number: receipt.receipt_number, amount: receipt.amount, type: receipt.type },
      payment: { amount: payment.amount, method: payment.method },
    };
    const after = {
      subscription: {
        subscription_value: newValue,
        subscription_type: targetType.name,
        subscription_type_id: targetType.id,
        paid_amount: newValue,
        remaining_amount: 0,
      },
      receipt: { amount: newValue, type: targetType.name },
      payment: { amount: newValue },
    };

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'preview',
          member: { code: memberCode, name: member.name },
          subscription_number: sub.subscription_number,
          before,
          after,
          priceListMismatch:
            targetType.price != null && Number(targetType.price) !== newValue
              ? `Warning: target plan's list price (${targetType.price}) differs from --new-value (${newValue}).`
              : undefined,
          note:
            'This corrects records only. If the member actually paid the higher amount in cash/card, the difference ' +
            `(${Number(sub.subscription_value) - newValue} EGP) must still be refunded to them separately — this script moves no real money.`,
        },
        null,
        2,
      ),
    );
    if (!apply) return;

    const ledger = new LedgerService(prisma);
    const accounts = new AccountsService(prisma);
    const moduleLedger = new ModuleLedgerService(ledger, accounts, prisma);
    const accounting = new ClubSubscriptionAccountingService(moduleLedger, ledger, prisma);
    const audit = new BusinessAuditService(prisma, new RequestContextService());

    await prisma.$transaction(async (tx) => {
      await tx.club_subscriptions.update({
        where: { id: sub.id },
        data: {
          subscription_value: newValue,
          subscription_type: targetType.name,
          subscription_type_id: targetType.id,
          paid_amount: newValue,
          remaining_amount: 0,
        },
      });
      await tx.club_receipts.update({
        where: { id: receipt.id },
        data: { amount: newValue, type: targetType.name },
      });
      await tx.club_receipt_payments.update({
        where: { id: payment.id },
        data: { amount: newValue },
      });

      await accounting.reverseReceiptEntry(
        receipt.receipt_number,
        `${reason} — عكس القيد الأصلي بقيمة ${sub.subscription_value}`,
        actorUserId,
        tx,
      );
      await accounting.postJournal(
        {
          subscriptionNumber: sub.subscription_number,
          paidAmount: newValue,
          subscriptionValue: newValue,
          discountValue: 0,
          discountEnabled: false,
          paymentMethod: payment.method,
          branchId: sub.branch_id,
          kind: 'subscription',
          sourceDocId: `${receipt.receipt_number}-CORR`,
        },
        tx,
      );

      await audit.log(
        {
          entityType: 'club_subscription',
          entityId: sub.id,
          action: 'manual_correction',
          actorUserId,
          branchId: sub.branch_id,
          before,
          after,
          reason,
        },
        tx,
      );
    });

    console.log(JSON.stringify({ applied: true, subscriptionId: sub.id, subscriptionNumber: sub.subscription_number }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
