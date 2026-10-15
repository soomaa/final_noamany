import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalActionDto, ListApprovalsDto } from './dto/procurement-ext.dto';
import { notDeletedFilter, toNumber } from './procurement.utils';
import { PurchaseOrdersService } from './purchase-orders.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

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

  async list(q: ListApprovalsDto) {
    const status = q.status && q.status !== 'all' ? q.status : 'pending';
    const and: Prisma.prc_requisitionsWhereInput[] = [
      notDeletedFilter(),
      { status },
    ];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { request_number: { contains: s } },
          { requesting_department: { contains: s } },
        ],
      });
    }
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

  async action(id: number, dto: ApprovalActionDto, userId: number) {
    const existing = await this.prisma.prc_requisitions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('طلب الشراء غير موجود');

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      return: 'returned',
    };
    const newStatus = statusMap[dto.action];
    if (!newStatus) throw new BadRequestException('إجراء غير صالح');

    if (dto.action === 'approve' || dto.action === 'reject') {
      if (existing.status !== 'pending') {
        throw new BadRequestException('يمكن الموافقة أو الرفض للطلبات المعلقة فقط');
      }
    } else if (existing.status !== 'pending') {
      throw new BadRequestException('يمكن إرجاع الطلبات المعلقة فقط');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prc_requisitions.update({
        where: { id },
        data: {
          status: newStatus,
          approval_notes: dto.notes?.trim() ?? null,
          approved_by: userId,
          approved_at: new Date(),
        },
        include: { items: true },
      });

      if (dto.action === 'approve') {
        await this.purchaseOrders.createFromRequisition(id, userId, tx);
      }

      return updated;
    });
    return this.map(row);
  }
}
