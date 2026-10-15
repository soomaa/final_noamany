import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { notDeletedFilter, toNumber } from './inventory.utils';
import {
  ListProductBranchesDto,
  UpdateProductBranchStockDto,
  UpsertProductBranchDto,
} from './dto/inventory.dto';

@Injectable()
export class ProductBranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** Path params bypass the global BranchScopeGuard, so branch access is asserted here. */
  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private map(row: Prisma.inv_product_branchesGetPayload<{ include: { product: true } }>) {
    return {
      id: row.id,
      productId: row.product_id,
      branchId: row.branch_id,
      stockQuantity: toNumber(row.stock_quantity),
      reorderPoint: toNumber(row.reorder_point),
      lastUpdated: row.last_updated,
      product: row.product,
    };
  }

  async list(q: ListProductBranchesDto, user?: JwtUser) {
    const and: Prisma.inv_product_branchesWhereInput[] = [];
    if (q.productId && q.productId !== 'all') and.push({ product_id: Number(q.productId) });
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) and.push({ branch_id: { in: scopedBranches } });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.inv_product_branches.findMany({
        where,
        include: { product: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_product_branches.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async byBranchProducts(branchId: number, user?: JwtUser) {
    this.assertBranchAccess(user, branchId);
    const rows = await this.prisma.inv_product_branches.findMany({
      where: { branch_id: branchId },
      include: { product: true },
    });
    return rows.map((r) => this.map(r));
  }

  async byBranchLowStock(branchId: number, user?: JwtUser) {
    const rows = await this.byBranchProducts(branchId, user);
    return rows.filter((r) => r.stockQuantity <= r.reorderPoint);
  }

  async byProductBranches(productId: number, user?: JwtUser) {
    const scopedBranches = this.branchScope.allowedBranchIds(user);
    const rows = await this.prisma.inv_product_branches.findMany({
      where: {
        product_id: productId,
        ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
      },
      include: { product: true },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.inv_product_branches.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!row) throw new NotFoundException('سجل الفرع غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return this.map(row);
  }

  async create(dto: UpsertProductBranchDto, user?: JwtUser) {
    this.assertBranchAccess(user, dto.branchId);
    this.rejectStockWrite(dto.stockQuantity);
    const product = await this.prisma.inv_products.findFirst({
      where: { id: dto.productId, ...notDeletedFilter() },
    });
    if (!product) throw new BadRequestException('المنتج غير موجود');
    const row = await this.prisma.inv_product_branches.upsert({
      where: {
        product_id_branch_id: { product_id: dto.productId, branch_id: dto.branchId },
      },
      create: {
        product_id: dto.productId,
        branch_id: dto.branchId,
        stock_quantity: 0,
        reorder_point: dto.reorderPoint ?? 10,
      },
      update: {
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
      },
      include: { product: true },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertProductBranchDto>, user?: JwtUser) {
    await this.findOne(id, user);
    this.rejectStockWrite(dto.stockQuantity);
    const row = await this.prisma.inv_product_branches.update({
      where: { id },
      data: {
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
      },
      include: { product: true },
    });
    return this.map(row);
  }

  async updateStock(id: number, dto: UpdateProductBranchStockDto, user?: JwtUser) {
    await this.findOne(id, user);
    throw new BadRequestException('الرصيد محسوب من حركات المخزون؛ استخدم جرد المخزون أو مستند حركة لتعديله');
  }

  private rejectStockWrite(quantity: unknown) {
    if (quantity !== undefined) throw new BadRequestException('الرصيد محسوب من حركات المخزون؛ استخدم جرد المخزون أو مستند حركة لتعديله');
  }

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
    throw new BadRequestException('لا يمكن حذف سجل رصيد الفرع؛ الرصيد محفوظ مع حركات المخزون');
  }
}
