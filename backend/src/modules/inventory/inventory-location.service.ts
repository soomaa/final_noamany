import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { notDeletedFilter } from './inventory.utils';

/**
 * Resolves flat, branch-scoped warehouses selected in operational forms.
 * Legacy requests without a warehouse can still use the branch's default location.
 */
@Injectable()
export class InventoryLocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Explicit operational locations are flat; branch ownership enforces access. */
  async resolveSelection(user: JwtUser, warehouseId: number, branchId?: number, tx?: Prisma.TransactionClient) {
    const location = await (tx ?? this.prisma).inv_warehouses.findFirst({
      where: { id: warehouseId, status: 'active', ...notDeletedFilter() },
    });
    if (!location) throw new BadRequestException('المخزن غير موجود أو غير نشط');
    if (!new BranchScopeService().isBranchAllowed(user, location.branch_id)) throw new ForbiddenException('المخزن خارج الفروع المسموح بها');
    if (branchId && location.branch_id !== branchId) throw new BadRequestException('المخزن لا يتبع الفرع المحدد');
    return { warehouseId: location.id, branchId: location.branch_id };
  }

  requireUserBranch(user: JwtUser): number {
    const branchId = Number(user.branch);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('حساب المستخدم غير مرتبط بفرع');
    }
    return branchId;
  }

  /** Accept an explicit branch only when it falls within the user's branch scope. */
  requireAllowedBranch(user: JwtUser, branchId: number): number {
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('اختر فرعًا صحيحًا');
    }
    if (!new BranchScopeService().isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('الفرع خارج الفروع المسموح بها');
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

    // Keep requests without an explicit warehouse compatible: create a default
    // location if the branch has not configured any stock location yet.
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
