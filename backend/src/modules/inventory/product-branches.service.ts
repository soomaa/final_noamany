import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import {
  ListProductBranchesDto,
  UpdateProductBranchStockDto,
  UpsertProductBranchDto,
} from './dto/inventory.dto';

@Injectable()
export class ProductBranchesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(q: ListProductBranchesDto) {
    const and: Prisma.inv_product_branchesWhereInput[] = [];
    if (q.productId && q.productId !== 'all') and.push({ product_id: Number(q.productId) });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
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

  async byBranchProducts(branchId: number) {
    const rows = await this.prisma.inv_product_branches.findMany({
      where: { branch_id: branchId },
      include: { product: true },
    });
    return rows.map((r) => this.map(r));
  }

  async byBranchLowStock(branchId: number) {
    const rows = await this.byBranchProducts(branchId);
    return rows.filter((r) => r.stockQuantity <= r.reorderPoint);
  }

  async byProductBranches(productId: number) {
    const rows = await this.prisma.inv_product_branches.findMany({
      where: { product_id: productId },
      include: { product: true },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_product_branches.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!row) throw new NotFoundException('سجل الفرع غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertProductBranchDto) {
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
        stock_quantity: dto.stockQuantity ?? 0,
        reorder_point: dto.reorderPoint ?? 10,
      },
      update: {
        ...(dto.stockQuantity !== undefined ? { stock_quantity: dto.stockQuantity } : {}),
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
      },
      include: { product: true },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertProductBranchDto>) {
    await this.findOne(id);
    const row = await this.prisma.inv_product_branches.update({
      where: { id },
      data: {
        ...(dto.stockQuantity !== undefined ? { stock_quantity: dto.stockQuantity } : {}),
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
      },
      include: { product: true },
    });
    return this.map(row);
  }

  async updateStock(id: number, dto: UpdateProductBranchStockDto) {
    await this.findOne(id);
    const row = await this.prisma.inv_product_branches.update({
      where: { id },
      data: { stock_quantity: dto.stockQuantity },
      include: { product: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.inv_product_branches.delete({ where: { id } });
    return { success: true };
  }
}
