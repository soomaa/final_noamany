import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListQuotationsDto, UpsertQuotationDto } from './dto/procurement-ext.dto';
import { notDeletedFilter, toNumber } from './procurement.utils';

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.prc_quotationsGetPayload<object>) {
    return {
      id: row.id,
      rfqId: row.rfq_id,
      supplierId: row.supplier_id,
      totalPrice: toNumber(row.total_price),
      deliveryTime: row.delivery_time,
      paymentTerms: row.payment_terms,
      receivedDate: row.received_date,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListQuotationsDto) {
    const and: Prisma.prc_quotationsWhereInput[] = [];
    if (q.rfqId && q.rfqId !== 'all') and.push({ rfq_id: Number(q.rfqId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ payment_terms: { contains: s } }, { delivery_time: { contains: s } }] });
    }
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.prc_quotations.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_quotations.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_quotations.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('عرض السعر غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertQuotationDto) {
    const rfq = await this.prisma.prc_rfqs.findFirst({
      where: { id: dto.rfqId, ...notDeletedFilter() },
    });
    if (!rfq) throw new NotFoundException('طلب عرض السعر غير موجود');
    const row = await this.prisma.prc_quotations.create({
      data: {
        rfq_id: dto.rfqId,
        supplier_id: dto.supplierId,
        total_price: dto.totalPrice,
        delivery_time: dto.deliveryTime ?? null,
        payment_terms: dto.paymentTerms ?? null,
        received_date: dto.receivedDate ?? null,
        status: dto.status ?? 'received',
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertQuotationDto>) {
    await this.findOne(id);
    const row = await this.prisma.prc_quotations.update({
      where: { id },
      data: {
        ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
        ...(dto.totalPrice !== undefined ? { total_price: dto.totalPrice } : {}),
        ...(dto.deliveryTime !== undefined ? { delivery_time: dto.deliveryTime ?? null } : {}),
        ...(dto.paymentTerms !== undefined ? { payment_terms: dto.paymentTerms ?? null } : {}),
        ...(dto.receivedDate !== undefined ? { received_date: dto.receivedDate ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.prc_quotations.delete({ where: { id } });
    return { success: true };
  }

  async accept(id: number) {
    const quotation = await this.prisma.prc_quotations.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('عرض السعر غير موجود');
    const rfq = await this.prisma.prc_rfqs.findFirst({
      where: { id: quotation.rfq_id, ...notDeletedFilter() },
    });
    if (!rfq) throw new NotFoundException('طلب عرض السعر غير موجود');
    if (rfq.status === 'completed') {
      throw new BadRequestException('طلب عرض السعر مكتمل مسبقاً');
    }
    await this.prisma.$transaction([
      this.prisma.prc_rfqs.update({
        where: { id: rfq.id },
        data: {
          selected_vendor_id: quotation.supplier_id,
          final_price: quotation.total_price,
          status: 'completed',
        },
      }),
      this.prisma.prc_quotations.update({
        where: { id },
        data: { status: 'accepted' },
      }),
      this.prisma.prc_quotations.updateMany({
        where: { rfq_id: rfq.id, id: { not: id } },
        data: { status: 'rejected' },
      }),
    ]);
    return this.findOne(id);
  }
}
