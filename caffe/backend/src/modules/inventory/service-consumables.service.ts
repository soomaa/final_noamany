import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNumber } from './inventory.utils';
import {
  BatchServiceConsumableDto,
  ListServiceConsumablesDto,
  UpsertServiceConsumableDto,
} from './dto/inventory.dto';

@Injectable()
export class ServiceConsumablesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_service_consumablesGetPayload<{ include: { consumable: true } }>) {
    return {
      id: row.id,
      serviceId: row.service_id,
      consumableId: row.consumable_id,
      quantity: toNumber(row.quantity),
      consumable: row.consumable,
      createdAt: row.created_at,
    };
  }

  async list(q: ListServiceConsumablesDto) {
    const and: Prisma.inv_service_consumablesWhereInput[] = [];
    if (q.serviceId && q.serviceId !== 'all') and.push({ service_id: Number(q.serviceId) });
    if (q.consumableId && q.consumableId !== 'all') and.push({ consumable_id: Number(q.consumableId) });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.inv_service_consumables.findMany({
        where,
        include: { consumable: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_service_consumables.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async byService(serviceId: number) {
    const rows = await this.prisma.inv_service_consumables.findMany({
      where: { service_id: serviceId },
      include: { consumable: true },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_service_consumables.findUnique({
      where: { id },
      include: { consumable: true },
    });
    if (!row) throw new NotFoundException('الربط غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertServiceConsumableDto) {
    const consumable = await this.prisma.inv_consumables.findFirst({
      where: { id: dto.consumableId, is_deleted: false },
    });
    if (!consumable) throw new BadRequestException('المستهلك غير موجود');

    const row = await this.prisma.inv_service_consumables.create({
      data: {
        service_id: dto.serviceId,
        consumable_id: dto.consumableId,
        quantity: dto.quantity ?? 1,
      },
      include: { consumable: true },
    });
    return this.map(row);
  }

  async batchCreate(dto: BatchServiceConsumableDto) {
    const created: Awaited<ReturnType<typeof this.create>>[] = [];
    for (const item of dto.items) {
      created.push(await this.create({ ...item, serviceId: dto.serviceId }));
    }
    return created;
  }

  async update(id: number, dto: Partial<UpsertServiceConsumableDto>) {
    await this.findOne(id);
    const row = await this.prisma.inv_service_consumables.update({
      where: { id },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.consumableId != null ? { consumable_id: dto.consumableId } : {}),
      },
      include: { consumable: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.inv_service_consumables.delete({ where: { id } });
    return { success: true };
  }
}
