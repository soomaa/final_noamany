import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { LedgerService } from '../../src/modules/accounting/ledger.service';

type Candidate = {
  entryId: number;
  docType: 'goods_receipt' | 'purchase_return';
  docRef: string;
  inventoryEffect: number;
  reason: string;
};

async function candidates(prisma: PrismaService): Promise<Candidate[]> {
  const inventory = await prisma.acc_accounts.findFirst({ where: { name: 'المخزون' } });
  if (!inventory) return [];
  const entries = await prisma.acc_journal_entries.findMany({
    where: {
      status: 'posted',
      reversed_by_id: null,
      source_doc_type: { in: ['goods_receipt', 'purchase_return'] },
      source_doc_id: { not: null },
    },
    include: { lines: { where: { account_id: inventory.id } } },
  });
  const result: Candidate[] = [];
  for (const entry of entries) {
    const docRef = entry.source_doc_id!;
    const movementCount = await prisma.inv_movements.count({ where: { doc_ref: docRef } });
    if (movementCount > 0) continue;

    const productIds: number[] = [];
    if (entry.source_doc_type === 'goods_receipt') {
      const document = await prisma.prc_goods_receipts.findUnique({
        where: { grn_number: docRef },
        include: { items: true },
      });
      if (!document) continue;
      productIds.push(...document.items.flatMap((item) => (item.product_id ? [item.product_id] : [])));
    } else {
      const document = await prisma.prc_purchase_returns.findUnique({
        where: { return_number: docRef },
        include: { items: true },
      });
      if (!document) continue;
      productIds.push(...document.items.map((item) => item.product_id));
    }
    const liveProducts = productIds.length
      ? await prisma.inv_products.count({ where: { id: { in: productIds } } })
      : 0;
    if (liveProducts > 0) continue;

    result.push({
      entryId: entry.id,
      docType: entry.source_doc_type as Candidate['docType'],
      docRef,
      inventoryEffect: entry.lines.reduce(
        (sum, line) => sum + Number(line.debit) - Number(line.credit),
        0,
      ),
      reason: 'عكس مستند مخزون يتيم بعد حذف بيانات الديمو؛ لا توجد حركة مخزنية ولا أصناف حالية مرتبطة به',
    });
  }
  return result;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const rows = await candidates(prisma);
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', rows }, null, 2));
    if (!process.argv.includes('--apply')) return;
    const ledger = new LedgerService(prisma);
    const user = await prisma.users.findFirst({ orderBy: { user_id: 'asc' }, select: { user_id: true } });
    const userId = user?.user_id ?? 1;
    for (const row of rows) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await ledger.reverseEntry(row.entryId, row.reason, userId, tx);
        if (row.docType === 'goods_receipt') {
          await tx.prc_goods_receipts.update({
            where: { grn_number: row.docRef },
            data: { stock_posted: false, posted_at: null, status: 'cancelled' },
          });
        } else {
          await tx.prc_purchase_returns.update({
            where: { return_number: row.docRef },
            data: { stock_posted: false, posted_at: null, status: 'ملغي' },
          });
        }
      });
    }
    console.log(JSON.stringify({ reversed: rows.length, inventoryEffectRemoved: rows.reduce((sum, row) => sum + row.inventoryEffect, 0) }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
