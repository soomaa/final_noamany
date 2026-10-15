import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListSupplierContractsDto, UpsertSupplierContractDto } from './dto/procurement-ext.dto';
import { nextDocNumber, notDeletedFilter, toNumber } from './procurement.utils';

@Injectable()
export class SupplierContractsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.prc_supplier_contractsGetPayload<object>) {
    return {
      id: row.id,
      contractNumber: row.contract_number,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      startDate: row.start_date,
      endDate: row.end_date,
      contractType: row.contract_type,
      contractValue: row.contract_value != null ? toNumber(row.contract_value) : null,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSupplierContractsDto) {
    const and: Prisma.prc_supplier_contractsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { contract_number: { contains: s } },
          { supplier_name: { contains: s } },
        ],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_supplier_contracts.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supplier_contracts.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_supplier_contracts.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!row) throw new NotFoundException('عقد المورد غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertSupplierContractDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const contractNumber =
        dto.contractNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_supplier_contracts', 'contract_number', 'SC'));
      return tx.prc_supplier_contracts.create({
        data: {
          contract_number: contractNumber,
          supplier_id: dto.supplierId ?? null,
          supplier_name: dto.supplierName ?? null,
          start_date: dto.startDate,
          end_date: dto.endDate,
          contract_type: dto.contractType ?? null,
          contract_value: dto.contractValue ?? null,
          status: dto.status ?? 'active',
          notes: dto.notes?.trim() ?? null,
        },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSupplierContractDto>) {
    await this.findOne(id);
    const row = await this.prisma.prc_supplier_contracts.update({
      where: { id },
      data: {
        ...(dto.supplierId !== undefined ? { supplier_id: dto.supplierId ?? null } : {}),
        ...(dto.supplierName !== undefined ? { supplier_name: dto.supplierName ?? null } : {}),
        ...(dto.startDate != null ? { start_date: dto.startDate } : {}),
        ...(dto.endDate != null ? { end_date: dto.endDate } : {}),
        ...(dto.contractType !== undefined ? { contract_type: dto.contractType ?? null } : {}),
        ...(dto.contractValue !== undefined ? { contract_value: dto.contractValue ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.prc_supplier_contracts.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
