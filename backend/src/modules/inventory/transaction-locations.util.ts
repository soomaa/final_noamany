import { BadRequestException } from '@nestjs/common';
import { InventoryTxnType, Prisma } from '@prisma/client';

/** Keep warehouse ownership stable until the transaction commits. */
export async function transactionLocations(
  tx: Prisma.TransactionClient,
  type: InventoryTxnType,
  branchId: number,
  sourceId?: number | null,
  targetId?: number | null,
) {
  if (type === InventoryTxnType.transfer && (!sourceId || !targetId || sourceId === targetId)) {
    throw new BadRequestException('التحويل يحتاج مخزن مصدر ومخزن وجهة مختلفين');
  }
  const ids = [...new Set([sourceId, targetId].filter((id): id is number => id != null))].sort((a, b) => a - b);
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new BadRequestException('اختر مخزنًا صالحًا للحركة');
  }
  await tx.$queryRaw(Prisma.sql`SELECT id FROM inv_warehouses WHERE id IN (${Prisma.join(ids)}) ORDER BY id LOCK IN SHARE MODE`);
  const rows = await tx.inv_warehouses.findMany({
    where: { id: { in: ids } }, select: { id: true, branch_id: true, status: true, is_deleted: true },
  });
  if (rows.length !== ids.length || rows.some(row => row.is_deleted || row.status !== 'active')) {
    throw new BadRequestException('أحد مخازن الحركة غير موجود أو غير نشط');
  }
  const source = rows.find(row => row.id === (sourceId ?? targetId))!;
  const target = rows.find(row => row.id === targetId);
  if (source.branch_id !== branchId || (type !== InventoryTxnType.transfer && rows.some(row => row.branch_id !== branchId))) {
    throw new BadRequestException('مخزن الصرف يجب أن يتبع فرع الحركة');
  }
  return { rows, source, target };
}
