import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSettlementPolicyDto } from './dto/final-settlement.dto';
import { BenefitTier, validateBenefitTiers } from './final-settlement.util';

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class FinalSettlementPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.payroll_settlement_policies.findMany({
      include: { tiers: { orderBy: { sort_order: 'asc' } } },
      orderBy: [{ effective_from: 'desc' }, { version: 'desc' }],
    });
  }

  async create(dto: CreateSettlementPolicyDto, userId?: number) {
    const tiers: BenefitTier[] = dto.tiers.map((row) => ({
      lowerYears: row.lowerYears,
      upperYears: row.upperYears ?? null,
      salaryMonthsPerYear: row.salaryMonthsPerYear,
    }));
    validateBenefitTiers(tiers);
    const from = asDate(dto.effectiveFrom);
    const to = dto.effectiveTo ? asDate(dto.effectiveTo) : null;
    if (to && to < from) throw new BadRequestException('نهاية سريان السياسة تسبق بدايتها');
    if (!dto.sourceReference.trim()) throw new BadRequestException('مرجع المصدر القانوني مطلوب');
    try {
      return await this.prisma.payroll_settlement_policies.create({
        data: {
          code: dto.code.trim(), version: dto.version, name: dto.name.trim(),
          jurisdiction: dto.jurisdiction.trim(), effective_from: from, effective_to: to,
          benefit_base: dto.benefitBase, leave_day_divisor: dto.leaveDayDivisor,
          max_compensated_leave_days: dto.maxCompensatedLeaveDays,
          benefit_taxable: dto.benefitTaxable, leave_taxable: dto.leaveTaxable,
          recover_all_outstanding_loans: dto.recoverAllOutstandingLoans,
          source_reference: dto.sourceReference.trim(), created_by: userId,
          tiers: { create: tiers.map((tier, index) => ({
            sort_order: index + 1, lower_years: tier.lowerYears,
            upper_years: tier.upperYears, salary_months_per_year: tier.salaryMonthsPerYear,
          })) },
        },
        include: { tiers: { orderBy: { sort_order: 'asc' } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('كود ونسخة سياسة التسوية موجودان مسبقًا');
      }
      throw error;
    }
  }

  async publish(id: number, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payroll_settlement_policies WHERE id = ${id} FOR UPDATE`;
      const policy = await tx.payroll_settlement_policies.findUnique({ where: { id }, include: { tiers: true } });
      if (!policy) throw new NotFoundException('سياسة التسوية النهائية غير موجودة');
      if (policy.status === 'published') return policy;
      const overlap = await tx.payroll_settlement_policies.findFirst({
        where: { id: { not: id }, status: 'published',
          effective_from: policy.effective_to ? { lte: policy.effective_to } : undefined,
          OR: [{ effective_to: null }, { effective_to: { gte: policy.effective_from } }],
        },
      });
      if (overlap) throw new ConflictException(`فترة السياسة تتداخل مع ${overlap.code}@${overlap.version}`);
      validateBenefitTiers(policy.tiers.map((tier) => ({
        lowerYears: Number(tier.lower_years), upperYears: tier.upper_years == null ? null : Number(tier.upper_years),
        salaryMonthsPerYear: Number(tier.salary_months_per_year),
      })));
      return tx.payroll_settlement_policies.update({ where: { id }, data: {
        status: 'published', published_by: userId, published_at: new Date(),
      }, include: { tiers: { orderBy: { sort_order: 'asc' } } } });
    });
  }

  async resolve(date: string) {
    const on = asDate(date);
    const rows = await this.prisma.payroll_settlement_policies.findMany({
      where: { status: 'published', effective_from: { lte: on }, OR: [{ effective_to: null }, { effective_to: { gte: on } }] },
      include: { tiers: { orderBy: { sort_order: 'asc' } } },
    });
    if (rows.length !== 1) throw new BadRequestException(rows.length ? 'توجد أكثر من سياسة تسوية تغطي التاريخ' : 'لا توجد سياسة تسوية نهائية منشورة تغطي التاريخ');
    const row = rows[0];
    if (!row.source_reference?.trim()) throw new BadRequestException('سياسة التسوية المنشورة بلا مرجع رسمي');
    const tiers = row.tiers.map((tier) => ({ lowerYears: Number(tier.lower_years), upperYears: tier.upper_years == null ? null : Number(tier.upper_years), salaryMonthsPerYear: Number(tier.salary_months_per_year) }));
    validateBenefitTiers(tiers);
    const key = `${row.code}@${row.version}`;
    return { row, tiers, key, snapshot: {
      id: row.id, code: row.code, version: row.version, key, name: row.name,
      jurisdiction: row.jurisdiction, effectiveFrom: row.effective_from.toISOString().slice(0, 10),
      effectiveTo: row.effective_to?.toISOString().slice(0, 10) ?? null,
      benefitBase: row.benefit_base, leaveDayDivisor: row.leave_day_divisor,
      maxCompensatedLeaveDays: row.max_compensated_leave_days == null ? null : Number(row.max_compensated_leave_days),
      benefitTaxable: row.benefit_taxable, leaveTaxable: row.leave_taxable,
      recoverAllOutstandingLoans: row.recover_all_outstanding_loans,
      sourceReference: row.source_reference, tiers,
    } as Prisma.InputJsonObject };
  }
}
