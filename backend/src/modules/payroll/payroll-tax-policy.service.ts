import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollTaxBracketInput, validateTaxBrackets } from './payroll-tax.util';
import { CreatePayrollTaxPolicyDto } from './dto/payroll-tax-policy.dto';

export interface ResolvedPayrollTaxPolicy {
  id: number;
  key: string;
  periodsPerYear: number;
  annualAllowance: number;
  annualTaxCredit: number;
  brackets: PayrollTaxBracketInput[];
  snapshot: Prisma.InputJsonObject;
}

function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('فترة مسيّرة الرواتب غير صالحة');
  }
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class PayrollTaxPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.payroll_tax_policies.findMany({
      include: { brackets: { orderBy: { sort_order: 'asc' } } },
      orderBy: [{ effective_from: 'desc' }, { version: 'desc' }],
    });
  }

  async create(dto: CreatePayrollTaxPolicyDto, userId?: number) {
    const brackets = dto.brackets.map((row) => ({
      lowerBound: row.lowerBound,
      upperBound: row.upperBound ?? null,
      ratePercent: row.ratePercent,
    }));
    validateTaxBrackets(brackets);
    const from = dateOnly(dto.effectiveFrom);
    const to = dto.effectiveTo ? dateOnly(dto.effectiveTo) : null;
    if (to && to < from) throw new BadRequestException('نهاية سريان السياسة تسبق بدايتها');
    if (!dto.sourceReference.trim()) {
      throw new BadRequestException('مرجع المصدر القانوني مطلوب');
    }
    try {
      return await this.prisma.payroll_tax_policies.create({
        data: {
          code: dto.code.trim(),
          version: dto.version,
          name: dto.name.trim(),
          jurisdiction: dto.jurisdiction.trim(),
          effective_from: from,
          effective_to: to,
          annual_allowance: dto.annualAllowance,
          annual_tax_credit: dto.annualTaxCredit ?? 0,
          periods_per_year: dto.periodsPerYear,
          source_reference: dto.sourceReference.trim(),
          created_by: userId,
          brackets: {
            create: brackets.map((row, index) => ({
              sort_order: index + 1,
              lower_bound: row.lowerBound,
              upper_bound: row.upperBound,
              rate_percent: row.ratePercent,
            })),
          },
        },
        include: { brackets: { orderBy: { sort_order: 'asc' } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('كود ونسخة سياسة الضريبة موجودان مسبقًا');
      }
      throw error;
    }
  }

  async publish(id: number, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payroll_tax_policies WHERE id = ${id} FOR UPDATE`;
      const policy = await tx.payroll_tax_policies.findUnique({
        where: { id },
        include: { brackets: { orderBy: { sort_order: 'asc' } } },
      });
      if (!policy) throw new NotFoundException('سياسة ضريبة الدخل غير موجودة');
      if (policy.status === 'published') return policy;
      if (policy.status !== 'draft') throw new BadRequestException('لا يمكن نشر هذه النسخة من السياسة');
      if (!policy.source_reference?.trim()) {
        throw new BadRequestException('مرجع المصدر القانوني مطلوب قبل النشر');
      }
      validateTaxBrackets(
        policy.brackets.map((row) => ({
          lowerBound: Number(row.lower_bound),
          upperBound: row.upper_bound == null ? null : Number(row.upper_bound),
          ratePercent: Number(row.rate_percent),
        })),
      );
      const overlap = await tx.payroll_tax_policies.findFirst({
        where: {
          id: { not: id },
          status: 'published',
          effective_from: policy.effective_to ? { lte: policy.effective_to } : undefined,
          OR: [{ effective_to: null }, { effective_to: { gte: policy.effective_from } }],
        },
        select: { id: true, code: true, version: true },
      });
      if (overlap) {
        throw new ConflictException(
          `فترة السياسة تتداخل مع ${overlap.code}@${overlap.version}`,
        );
      }
      return tx.payroll_tax_policies.update({
        where: { id },
        data: { status: 'published', published_by: userId, published_at: new Date() },
        include: { brackets: { orderBy: { sort_order: 'asc' } } },
      });
    });
  }

  async resolveForPeriod(fromDate: string, toDate: string): Promise<ResolvedPayrollTaxPolicy> {
    const policies = await this.prisma.payroll_tax_policies.findMany({
      where: {
        status: 'published',
        effective_from: { lte: dateOnly(fromDate) },
        OR: [{ effective_to: null }, { effective_to: { gte: dateOnly(toDate) } }],
      },
      include: { brackets: { orderBy: { sort_order: 'asc' } } },
      orderBy: [{ effective_from: 'desc' }, { version: 'desc' }],
    });
    if (policies.length === 0) {
      throw new BadRequestException(
        `لا توجد سياسة ضريبة دخل منشورة تغطي كامل فترة المسيرة ${fromDate} إلى ${toDate}`,
      );
    }
    if (policies.length > 1) {
      throw new BadRequestException('توجد أكثر من سياسة ضريبة دخل منشورة تغطي نفس فترة المسيرة');
    }
    const policy = policies[0];
    if (!policy.source_reference?.trim()) {
      throw new BadRequestException('سياسة ضريبة الدخل المنشورة لا تحتوي مرجع المصدر القانوني');
    }
    const brackets = policy.brackets.map((bracket) => ({
      lowerBound: Number(bracket.lower_bound),
      upperBound: bracket.upper_bound == null ? null : Number(bracket.upper_bound),
      ratePercent: Number(bracket.rate_percent),
    }));
    validateTaxBrackets(brackets);
    const key = `${policy.code}@${policy.version}`;
    const snapshot: Prisma.InputJsonObject = {
      id: policy.id,
      code: policy.code,
      version: policy.version,
      key,
      name: policy.name,
      jurisdiction: policy.jurisdiction,
      effectiveFrom: policy.effective_from.toISOString().slice(0, 10),
      effectiveTo: policy.effective_to?.toISOString().slice(0, 10) ?? null,
      annualAllowance: Number(policy.annual_allowance),
      annualTaxCredit: Number(policy.annual_tax_credit),
      periodsPerYear: policy.periods_per_year,
      sourceReference: policy.source_reference,
      rounding: 'currency-half-away-via-cent-rounding',
      brackets: brackets.map((bracket) => ({ ...bracket })),
    };
    return {
      id: policy.id,
      key,
      periodsPerYear: policy.periods_per_year,
      annualAllowance: Number(policy.annual_allowance),
      annualTaxCredit: Number(policy.annual_tax_credit),
      brackets,
      snapshot,
    };
  }
}
