import { Prisma, SalesPaymentMethod } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AccountsService } from '../../src/modules/accounting/accounts.service';
import { LedgerService } from '../../src/modules/accounting/ledger.service';
import { ModuleLedgerService } from '../../src/modules/accounting/module-ledger.service';
import { recordSystemRevenue } from '../../src/modules/finance/system-revenue.util';

type Candidate = {
  bookingId: number;
  bookingNumber: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: SalesPaymentMethod;
  paymentDate: string;
  branchId: number;
  customerName: string;
  createdBy: number;
  legacyRevenueId: number | null;
};

async function candidates(prisma: PrismaService): Promise<Candidate[]> {
  const rows = await prisma.sales_bookings.findMany({
    where: {
      paid_amount: { gt: 0 },
      payments: { none: {} },
    },
    orderBy: { id: 'asc' },
  });
  const fallbackUser = await prisma.users.findFirst({
    orderBy: { user_id: 'asc' },
    select: { user_id: true },
  });

  return Promise.all(
    rows.map(async (booking) => {
      const legacyRevenue = await prisma.fin_revenues.findFirst({
        where: {
          source_module: 'booking',
          source_ref: booking.booking_number,
          is_deleted: false,
        },
        select: { id: true },
      });
      return {
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        paymentNumber: `BKP-LEGACY-${booking.id}`,
        amount: Number(booking.paid_amount),
        paymentMethod: booking.payment_method ?? 'cash',
        paymentDate: booking.booking_date,
        branchId: booking.branch_id,
        customerName: booking.customer_name,
        createdBy: booking.created_by ?? fallbackUser?.user_id ?? 1,
        legacyRevenueId: legacyRevenue?.id ?? null,
      };
    }),
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const rows = await candidates(prisma);
    const statusCorrections = await prisma.sales_bookings.findMany({
      where: {
        payment_status: 'partial',
        paid_amount: 0,
        refunded_amount: 0,
        payments: { none: {} },
      },
      select: { id: true, booking_number: true },
      orderBy: { id: 'asc' },
    });
    const apply = process.argv.includes('--apply');
    console.log(
      JSON.stringify({ mode: apply ? 'apply' : 'preview', rows, statusCorrections }, null, 2),
    );
    if (!apply) return;

    const ledger = new LedgerService(prisma);
    const accounts = new AccountsService(prisma);
    const moduleLedger = new ModuleLedgerService(ledger, accounts);

    for (const row of rows) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.sales_booking_payments.create({
          data: {
            payment_number: row.paymentNumber,
            booking_id: row.bookingId,
            kind: 'payment',
            amount: row.amount,
            method: row.paymentMethod,
            payment_date: row.paymentDate,
            notes: 'ترحيل دفعة حجز تاريخية إلى سجل التحصيل المرتبط',
            created_by: row.createdBy,
          },
        });
        await moduleLedger.postBookingPayment(
          {
            paymentNumber: row.paymentNumber,
            bookingNumber: row.bookingNumber,
            branchId: row.branchId,
            date: row.paymentDate,
            amount: row.amount,
            paymentMethod: row.paymentMethod,
            createdBy: row.createdBy,
          },
          tx,
        );

        if (row.legacyRevenueId) {
          await tx.fin_revenues.update({
            where: { id: row.legacyRevenueId },
            data: {
              source_module: 'booking_payment',
              source_ref: row.paymentNumber,
              sub_source: 'دفعة حجز',
              invoice_number: row.paymentNumber,
              notes: 'تم ربط الإيراد التاريخي بسجل دفعة الحجز والقيد المحاسبي',
            },
          });
        } else {
          await recordSystemRevenue(tx, {
            sourceModule: 'booking_payment',
            sourceRef: row.paymentNumber,
            date: row.paymentDate,
            source: 'حجوزات',
            subSource: 'دفعة حجز',
            amount: row.amount,
            description: `دفعة حجز تاريخية ${row.bookingNumber}`,
            customerName: row.customerName,
            invoiceNumber: row.paymentNumber,
            branchId: row.branchId,
            createdBy: row.createdBy,
            paymentMethod: row.paymentMethod,
          });
        }
      });
    }
    if (statusCorrections.length) {
      await prisma.sales_bookings.updateMany({
        where: { id: { in: statusCorrections.map((row) => row.id) } },
        data: { payment_status: 'unpaid' },
      });
    }
    console.log(
      JSON.stringify({
        reconciled: rows.length,
        totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
        correctedEmptyPartialStatuses: statusCorrections.length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
