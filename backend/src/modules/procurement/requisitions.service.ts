import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ListRequisitionsDto,
  RequisitionItemDto,
  UpsertRequisitionDto,
} from './dto/procurement-ext.dto';
import {
  generateRequisitionNumber,
  lineTotal,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class RequisitionsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapItem(item: Prisma.prc_requisition_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      name: item.name,
      quantity: toNumber(item.quantity),
      unit: item.unit,
      specifications: item.specifications,
      estimatedPrice: item.estimated_price != null ? toNumber(item.estimated_price) : null,
    };
  }

  private map(row: Prisma.prc_requisitionsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      requestNumber: row.request_number,
      requestType: row.request_type,
      requestingDepartment: row.requesting_department,
      requiredDate: row.required_date,
      priority: row.priority,
      status: row.status,
      estimatedValue: row.estimated_value != null ? toNumber(row.estimated_value) : null,
      approvalNotes: row.approval_notes,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private computeEstimatedValue(items: { quantity: number; estimatedPrice?: number | null }[]) {
    return items.reduce(
      (sum, i) => sum + lineTotal(i.quantity, i.estimatedPrice ?? 0),
      0,
    );
  }

  async list(q: ListRequisitionsDto) {
    const and: Prisma.prc_requisitionsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { request_number: { contains: s } },
          { requesting_department: { contains: s } },
        ],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.department?.trim()) and.push({ requesting_department: { contains: q.department.trim() } });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_requisitions.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_requisitions.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('طلب الشراء غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertRequisitionDto, userId: number) {
    const items = dto.items ?? [];
    const estimatedValue = this.computeEstimatedValue(
      items.map((i) => ({ quantity: i.quantity, estimatedPrice: i.estimatedPrice })),
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const requestNumber =
        dto.requestNumber?.trim() || (await generateRequisitionNumber(tx));
      return tx.prc_requisitions.create({
        data: {
          request_number: requestNumber,
          request_type: dto.requestType ?? null,
          requesting_department: dto.requestingDepartment.trim(),
          required_date: dto.requiredDate ?? null,
          priority: dto.priority ?? 'normal',
          status: 'draft',
          estimated_value: estimatedValue,
          branch_id: dto.branchId,
          created_by: userId,
          items: items.length
            ? {
                create: items.map((i) => ({
                  product_id: i.productId ?? null,
                  name: i.name.trim(),
                  quantity: i.quantity,
                  unit: i.unit ?? null,
                  specifications: i.specifications ?? null,
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

  async update(id: number, dto: Partial<UpsertRequisitionDto>) {
    const existing = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب الشراء غير موجود');
    if (!['draft', 'returned'].includes(existing.status)) {
      throw new BadRequestException('لا يمكن تعديل الطلب إلا في حالة المسودة أو المرتجع');
    }
    const row = await this.prisma.prc_requisitions.update({
      where: { id },
      data: {
        ...(dto.requestType !== undefined ? { request_type: dto.requestType ?? null } : {}),
        ...(dto.requestingDepartment != null
          ? { requesting_department: dto.requestingDepartment.trim() }
          : {}),
        ...(dto.requiredDate !== undefined ? { required_date: dto.requiredDate ?? null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
      },
      include: { items: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب الشراء غير موجود');
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن حذف طلب غير مسودة');
    }
    await this.prisma.prc_requisitions.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async addItem(id: number, dto: RequisitionItemDto) {
    const existing = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('طلب الشراء غير موجود');
    if (!['draft', 'returned'].includes(existing.status)) {
      throw new BadRequestException('لا يمكن إضافة بنود إلا للطلبات القابلة للتعديل');
    }
    await this.prisma.prc_requisition_items.create({
      data: {
        requisition_id: id,
        product_id: dto.productId ?? null,
        name: dto.name.trim(),
        quantity: dto.quantity,
        unit: dto.unit ?? null,
        specifications: dto.specifications ?? null,
        estimated_price: dto.estimatedPrice ?? null,
      },
    });
    const items = await this.prisma.prc_requisition_items.findMany({ where: { requisition_id: id } });
    const estimatedValue = this.computeEstimatedValue(
      items.map((i) => ({
        quantity: toNumber(i.quantity),
        estimatedPrice: i.estimated_price != null ? toNumber(i.estimated_price) : null,
      })),
    );
    await this.prisma.prc_requisitions.update({
      where: { id },
      data: { estimated_value: estimatedValue },
    });
    return this.findOne(id);
  }

  async submit(id: number) {
    const existing = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('طلب الشراء غير موجود');
    if (existing.status !== 'draft') {
      throw new BadRequestException('يمكن إرسال الطلبات في حالة المسودة فقط');
    }
    if (!existing.items.length) {
      throw new BadRequestException('يجب إضافة بنود قبل الإرسال');
    }
    const row = await this.prisma.prc_requisitions.update({
      where: { id },
      data: { status: 'pending' },
      include: { items: true },
    });
    return this.map(row);
  }
}
