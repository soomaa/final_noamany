import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ImportRequisitionDto,
  ListRfqsDto,
  RfqItemDto,
  UpsertRfqDto,
} from './dto/procurement-ext.dto';
import {
  RFQ_TRANSITIONS,
  lineTotal,
  nextDocNumber,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class RfqsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapItem(item: Prisma.prc_rfq_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      itemCode: item.item_code,
      itemName: item.item_name,
      quantity: toNumber(item.quantity),
      unit: item.unit,
      estimatedPrice: item.estimated_price != null ? toNumber(item.estimated_price) : null,
    };
  }

  private map(row: Prisma.prc_rfqsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      rfqNumber: row.rfq_number,
      subject: row.subject,
      requestingDepartment: row.requesting_department,
      requiredDate: row.required_date,
      status: row.status,
      estimatedBudget: row.estimated_budget != null ? toNumber(row.estimated_budget) : null,
      selectedVendorId: row.selected_vendor_id,
      finalPrice: row.final_price != null ? toNumber(row.final_price) : null,
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private enforceTransition(from: string, to: string) {
    const allowed = RFQ_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`لا يمكن الانتقال من ${from} إلى ${to}`);
    }
  }

  async list(q: ListRfqsDto) {
    const and: Prisma.prc_rfqsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ rfq_number: { contains: s } }, { subject: { contains: s } }],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_rfqs.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_rfqs.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_rfqs.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('طلب عرض السعر غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertRfqDto, userId: number) {
    const items = dto.items ?? [];
    const estimatedBudget = items.reduce(
      (sum, i) => sum + lineTotal(i.quantity, i.estimatedPrice ?? 0),
      0,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const rfqNumber =
        dto.rfqNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_rfqs', 'rfq_number', 'RFQ'));
      return tx.prc_rfqs.create({
        data: {
          rfq_number: rfqNumber,
          subject: dto.subject.trim(),
          requesting_department: dto.requestingDepartment.trim(),
          required_date: dto.requiredDate ?? null,
          status: dto.status ?? 'draft',
          estimated_budget: dto.estimatedBudget ?? estimatedBudget,
          branch_id: dto.branchId,
          created_by: userId,
          items: items.length
            ? {
                create: items.map((i) => ({
                  product_id: i.productId ?? null,
                  item_code: i.itemCode ?? null,
                  item_name: i.itemName.trim(),
                  quantity: i.quantity,
                  unit: i.unit ?? null,
                  estimated_price: i.estimatedPrice ?? null,
                })),
              }
            : undefined,
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertRfqDto>) {
    const existing = await this.prisma.prc_rfqs.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب عرض السعر غير موجود');
    if (dto.status && dto.status !== existing.status) {
      this.enforceTransition(existing.status, dto.status);
    }
    const row = await this.prisma.prc_rfqs.update({
      where: { id },
      data: {
        ...(dto.subject != null ? { subject: dto.subject.trim() } : {}),
        ...(dto.requestingDepartment != null
          ? { requesting_department: dto.requestingDepartment.trim() }
          : {}),
        ...(dto.requiredDate !== undefined ? { required_date: dto.requiredDate ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.estimatedBudget !== undefined ? { estimated_budget: dto.estimatedBudget } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
      },
      include: { items: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_rfqs.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب عرض السعر غير موجود');
    await this.prisma.prc_rfqs.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async addItem(id: number, dto: RfqItemDto) {
    const existing = await this.prisma.prc_rfqs.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب عرض السعر غير موجود');
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن إضافة بنود إلا لطلبات المسودة');
    }
    await this.prisma.prc_rfq_items.create({
      data: {
        rfq_id: id,
        product_id: dto.productId ?? null,
        item_code: dto.itemCode ?? null,
        item_name: dto.itemName.trim(),
        quantity: dto.quantity,
        unit: dto.unit ?? null,
        estimated_price: dto.estimatedPrice ?? null,
      },
    });
    return this.findOne(id);
  }

  async importRequisition(id: number, dto: ImportRequisitionDto) {
    const rfq = await this.prisma.prc_rfqs.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!rfq) throw new NotFoundException('طلب عرض السعر غير موجود');
    if (rfq.status !== 'draft') {
      throw new BadRequestException('يمكن استيراد البنود لطلبات المسودة فقط');
    }
    const requisition = await this.prisma.prc_requisitions.findFirst({
      where: { id: dto.requisitionId, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!requisition) throw new NotFoundException('طلب الشراء غير موجود');
    if (requisition.status !== 'approved') {
      throw new BadRequestException('يمكن استيراد البنود من الطلبات المعتمدة فقط');
    }
    if (!requisition.items.length) {
      throw new BadRequestException('طلب الشراء لا يحتوي على بنود');
    }
    await this.prisma.prc_rfq_items.createMany({
      data: requisition.items.map((item) => ({
        rfq_id: id,
        product_id: item.product_id,
        item_name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        estimated_price: item.estimated_price,
      })),
    });
    return this.findOne(id);
  }
}
