import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ListStoragesDto, StorageProductDto, UpsertStorageDto } from './dto/inventory.dto';

@Injectable()
export class StoragesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_storagesGetPayload<object>) {
    return {
      id: row.id,
      name: row.name,
      branchId: row.branch_id,
      email: row.email,
      imageAttachment: row.image_attachment,
      licenceAttachment: row.licence_attachment,
      safetyCertAttachment: row.safety_cert_attachment,
      plansAttachment: row.plans_attachment,
      reportsAttachment: row.reports_attachment,
      otherAttachment: row.other_attachment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListStoragesDto) {
    const and: Prisma.inv_storagesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { email: { contains: s } }] });
    }
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_storages.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_storages.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_storages.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('المخزن غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertStorageDto) {
    if (!dto.name?.trim()) throw new BadRequestException('اسم المخزن مطلوب');
    const row = await this.prisma.inv_storages.create({
      data: {
        name: dto.name.trim(),
        branch_id: dto.branchId,
        email: dto.email.trim(),
        image_attachment: dto.imageAttachment ?? null,
        licence_attachment: dto.licenceAttachment ?? null,
        safety_cert_attachment: dto.safetyCertAttachment ?? null,
        plans_attachment: dto.plansAttachment ?? null,
        reports_attachment: dto.reportsAttachment ?? null,
        other_attachment: dto.otherAttachment ?? null,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertStorageDto>) {
    const existing = await this.prisma.inv_storages.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المخزن غير موجود');
    const row = await this.prisma.inv_storages.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.email != null ? { email: dto.email.trim() } : {}),
        ...(dto.imageAttachment !== undefined ? { image_attachment: dto.imageAttachment ?? null } : {}),
        ...(dto.licenceAttachment !== undefined ? { licence_attachment: dto.licenceAttachment ?? null } : {}),
        ...(dto.safetyCertAttachment !== undefined ? { safety_cert_attachment: dto.safetyCertAttachment ?? null } : {}),
        ...(dto.plansAttachment !== undefined ? { plans_attachment: dto.plansAttachment ?? null } : {}),
        ...(dto.reportsAttachment !== undefined ? { reports_attachment: dto.reportsAttachment ?? null } : {}),
        ...(dto.otherAttachment !== undefined ? { other_attachment: dto.otherAttachment ?? null } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_storages.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المخزن غير موجود');
    await this.prisma.inv_storages.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  async listProducts(storageId: number) {
    await this.findOne(storageId);
    const rows = await this.prisma.inv_product_storages.findMany({
      where: { storage_id: storageId },
      include: { product: true },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      quantity: toNumber(r.quantity),
      product: r.product,
    }));
  }

  async addProduct(storageId: number, dto: StorageProductDto) {
    await this.findOne(storageId);
    const product = await this.prisma.inv_products.findFirst({
      where: { id: dto.productId, ...notDeletedFilter() },
    });
    if (!product) throw new BadRequestException('المنتج غير موجود');
    const row = await this.prisma.inv_product_storages.upsert({
      where: { storage_id_product_id: { storage_id: storageId, product_id: dto.productId } },
      create: { storage_id: storageId, product_id: dto.productId, quantity: dto.quantity },
      update: { quantity: dto.quantity },
      include: { product: true },
    });
    return { id: row.id, productId: row.product_id, quantity: toNumber(row.quantity), product: row.product };
  }
}
