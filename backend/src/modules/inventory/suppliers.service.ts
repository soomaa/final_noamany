import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListSuppliersDto, UpsertSupplierDto } from './dto/inventory.dto';
import { InventoryLocationService } from './inventory-location.service';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly location: InventoryLocationService,
  ) {}

  private map(row: Prisma.inv_suppliersGetPayload<{ include: { phones: true } }>) {
    const phones = [...row.phones]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map((phone) => ({ id: phone.id, phone: phone.phone, isPrimary: phone.is_primary }));
    return {
      id: row.id,
      nameAr: row.name_ar, nameEn: row.name_en, email: row.email, phones, primaryPhone: phones.find((phone) => phone.isPrimary)?.phone ?? phones[0]?.phone ?? null, address: row.address, taxNumber: row.tax_number, contactPerson: row.contact_person, notes: row.notes, rating: row.rating != null ? Number(row.rating) : null, isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSuppliersDto) {
    const and: Prisma.inv_suppliersWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { name_en: { contains: s } }, { phones: { some: { phone: { contains: s } } } }] });
    }
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where: Prisma.inv_suppliersWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_suppliers.findMany({ where, include: { phones: true }, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_suppliers.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_suppliers.findFirst({ where: { id, ...notDeletedFilter() }, include: { phones: true } });
    if (!row) throw new NotFoundException('المورد غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertSupplierDto) {
    const phones = this.normalisePhones(dto.phones);
    const row = await this.prisma.inv_suppliers.create({ data: { name_ar: dto.nameAr, name_en: dto.nameEn, email: dto.email ?? null, address: dto.address ?? null, tax_number: dto.taxNumber ?? null, contact_person: dto.contactPerson ?? null, notes: dto.notes ?? null, rating: dto.rating ?? null, is_active: dto.isActive ?? true, phones: phones.length ? { create: phones.map((phone, sortOrder) => ({ phone: phone.phone, is_primary: phone.isPrimary, sort_order: sortOrder })) } : undefined, supplied_products: dto.productIds?.length ? { create: dto.productIds.map((productId) => ({ product_id: productId })) } : undefined }, include: { phones: true } });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSupplierDto>) {
    const existing = await this.prisma.inv_suppliers.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المورد غير موجود');
    if (dto.productIds || dto.phones) {
      await this.prisma.$transaction(async (tx) => {
        if (dto.productIds) {
          await tx.inv_supplier_products.deleteMany({ where: { supplier_id: id } });
          if (dto.productIds.length) await tx.inv_supplier_products.createMany({ data: dto.productIds.map((productId) => ({ supplier_id: id, product_id: productId })) });
        }
        if (dto.phones) {
          const phones = this.normalisePhones(dto.phones);
          await tx.inv_supplier_phones.deleteMany({ where: { supplier_id: id } });
          if (phones.length) await tx.inv_supplier_phones.createMany({ data: phones.map((phone, sortOrder) => ({ supplier_id: id, phone: phone.phone, is_primary: phone.isPrimary, sort_order: sortOrder })) });
        }
      });
    }
    const row = await this.prisma.inv_suppliers.update({ where: { id }, data: { ...(dto.nameAr != null ? { name_ar: dto.nameAr } : {}), ...(dto.nameEn != null ? { name_en: dto.nameEn } : {}), ...(dto.email !== undefined ? { email: dto.email ?? null } : {}), ...(dto.address !== undefined ? { address: dto.address ?? null } : {}), ...(dto.taxNumber !== undefined ? { tax_number: dto.taxNumber ?? null } : {}), ...(dto.contactPerson !== undefined ? { contact_person: dto.contactPerson ?? null } : {}), ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}), ...(dto.rating !== undefined ? { rating: dto.rating ?? null } : {}), ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}) }, include: { phones: true } });
    return this.map(row);
  }

  private normalisePhones(phones: UpsertSupplierDto['phones'] = []) {
    const canonical = phones
      .map((phone) => ({ ...phone, phone: phone.phone.replace(/[\s()-]/g, '').trim() }))
      .filter((phone) => phone.phone.length > 0);
    const unique = [...new Map(canonical.map((phone) => [phone.phone, phone])).values()];
    const primaryIndex = unique.findIndex((phone) => phone.isPrimary);
    return unique.map((phone, index) => ({
      phone: phone.phone,
      isPrimary: unique.length > 0 && index === (primaryIndex >= 0 ? primaryIndex : 0),
    }));
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_suppliers.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المورد غير موجود');
    await this.prisma.inv_suppliers.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  async products(id: number, warehouseId?: number, branchId?: number) {
    await this.findOne(id);
    let resolvedWarehouseId = warehouseId;
    if (!resolvedWarehouseId && branchId) {
      resolvedWarehouseId = await this.location.resolveBranchStockLocation(branchId);
    }
    const links = await this.prisma.inv_supplier_products.findMany({
      where: {
        supplier_id: id,
        is_active: true,
        product: { is_deleted: false, status: 'active' },
      },
      include: { product: true },
      orderBy: { product: { name_ar: 'asc' } },
    });
    const productIds = links.map((link) => link.product_id);
    const stockRows = productIds.length
      ? await this.prisma.inv_stock_balances.groupBy({
          by: ['product_id'],
          where: { product_id: { in: productIds }, ...(resolvedWarehouseId ? { warehouse_id: resolvedWarehouseId } : {}) },
          _sum: { current_stock: true },
        })
      : [];
    const stock = new Map(stockRows.map((row) => [row.product_id, Number(row._sum.current_stock ?? 0)]));
    return links.map((link) => ({
      id: link.product.id,
      productCode: link.product.product_code,
      nameAr: link.product.name_ar,
      size: link.product.size,
      unitOfMeasure: link.product.unit_of_measure,
      costPrice: Number(link.product.cost_price),
      currentStock: stock.get(link.product.id) ?? 0,
      inventoryKind: link.product.inventory_kind,
      purchaseUnit: link.purchase_unit,
      lastUnitCost: link.last_unit_cost != null ? Number(link.last_unit_cost) : null,
    }));
  }
}
