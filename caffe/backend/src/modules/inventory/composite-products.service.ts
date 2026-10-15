import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ListCompositeProductsDto, UpsertCompositeProductDto } from './dto/inventory.dto';

@Injectable()
export class CompositeProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_composite_productsGetPayload<{ include: { items: { include: { product: true } } } }>) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      unit: row.unit,
      price: toNumber(row.price),
      isActive: row.is_active,
      items: row.items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        quantity: toNumber(i.quantity),
        product: i.product
          ? { id: i.product.id, productCode: i.product.product_code, nameAr: i.product.name_ar, costPrice: toNumber(i.product.cost_price) }
          : null,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListCompositeProductsDto) {
    const and: Prisma.inv_composite_productsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { code: { contains: s } }] });
    }
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_composite_products.findMany({
        where,
        include: { items: { include: { product: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_composite_products.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_composite_products.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: { include: { product: true } } },
    });
    if (!row) throw new NotFoundException('المنتج المركب غير موجود');
    return this.map(row);
  }

  private async generateCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_composite_products WHERE code LIKE 'CMP%'
    `;
    return `CMP${String((rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  private async computePrice(items: { productId: number; quantity: number }[]): Promise<number> {
    let total = 0;
    for (const item of items) {
      const product = await this.prisma.inv_products.findFirst({
        where: { id: item.productId, ...notDeletedFilter() },
      });
      if (!product) throw new BadRequestException(`المنتج ${item.productId} غير موجود`);
      total += toNumber(product.cost_price) * item.quantity;
    }
    return total;
  }

  async create(dto: UpsertCompositeProductDto) {
    if (!dto.items?.length) throw new BadRequestException('يجب إضافة مكون واحد على الأقل');
    if (!dto.name?.trim()) throw new BadRequestException('اسم المنتج المركب مطلوب');

    const price = dto.price ?? (await this.computePrice(dto.items));

    const row = await this.prisma.$transaction(async (tx) => {
      return tx.inv_composite_products.create({
        data: {
          name: dto.name.trim(),
          code: dto.code?.trim() || (await this.generateCode()),
          description: dto.description ?? null,
          unit: dto.unit ?? null,
          price,
          is_active: dto.isActive ?? false,
          items: {
            create: dto.items.map((i) => ({
              product_id: i.productId,
              quantity: i.quantity,
            })),
          },
        },
        include: { items: { include: { product: true } } },
      });
    });

    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertCompositeProductDto>) {
    const existing = await this.prisma.inv_composite_products.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المنتج المركب غير موجود');

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.inv_composite_items.deleteMany({ where: { composite_product_id: id } });
      }
      const price =
        dto.price ??
        (dto.items ? await this.computePrice(dto.items) : undefined);

      return tx.inv_composite_products.update({
        where: { id },
        data: {
          ...(dto.name != null ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit ?? null } : {}),
          ...(price !== undefined ? { price } : {}),
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
                    product_id: i.productId,
                    quantity: i.quantity,
                  })),
                },
              }
            : {}),
        },
        include: { items: { include: { product: true } } },
      });
    });

    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_composite_products.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المنتج المركب غير موجود');
    await this.prisma.inv_composite_products.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
