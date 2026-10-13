import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { notDeletedFilter } from './inventory.utils';

/**
 * Keeps the database's required stock location internal to the application.
 * Noamany operates one logical inventory per branch, so users never choose a
 * warehouse in business forms.
 */
@Injectable()
export class InventoryLocationService {
  constructor(private readonly prisma: PrismaService) {}

  requireUserBranch(user: JwtUser): number {
    const branchId = Number(user.branch);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('حساب المستخدم غير مرتبط بفرع');
    }
    return branchId;
  }

  async resolveBranchStockLocation(
    branchId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const location = await db.inv_warehouses.findFirst({
      where: { branch_id: branchId, status: 'active', ...notDeletedFilter() },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (location) return location.id;

    // The DB schema requires a stock-balance location, although Noamany has no
    // warehouse concept in the UI. Create one hidden logical location per
    // branch on first use so a fresh branch works without manual setup.
    const internalCode = `Noamany-STOCK-${branchId}`;
    const internal = await db.inv_warehouses.upsert({
      where: { warehouse_code: internalCode },
      create: {
        warehouse_code: internalCode,
        name_ar: 'مخزون الفرع',
        name_en: 'Branch inventory',
        type: 'main',
        storage_capacity: 1,
        branch_id: branchId,
        status: 'active',
      },
      update: { branch_id: branchId, status: 'active', is_deleted: false },
      select: { id: true },
    });
    return internal.id;
  }
}
