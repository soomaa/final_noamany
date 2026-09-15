import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

type TargetUnit = 'members' | 'money';

type TargetPeriodRow = {
  id: number;
  trainer_id: number;
  period_month: string;
  period_start: string;
  period_end: string;
  target_value: unknown;
  target_unit: string;
  notes: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ClubTrainerTargetPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: BranchScopeService,
  ) {}

  async list(trainerId: number, user: JwtUser) {
    await this.assertAccess(trainerId, user);
    const rows = await this.prisma.club_trainer_target_periods.findMany({
      where: { trainer_id: trainerId },
      orderBy: [{ period_month: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async upsert(
    trainerId: number,
    periodMonth: string,
    body: { targetValue?: number; targetUnit?: TargetUnit; notes?: string },
    user: JwtUser,
  ) {
    await this.assertAccess(trainerId, user);
    const { start, end } = this.monthBounds(periodMonth);
    const targetValue = Number(body.targetValue);
    if (!Number.isFinite(targetValue) || targetValue < 0) {
      throw new BadRequestException('قيمة التارجت يجب أن تكون صفرًا أو أكبر');
    }
    const targetUnit: TargetUnit = body.targetUnit ?? 'members';
    if (targetUnit !== 'members' && targetUnit !== 'money') {
      throw new BadRequestException('وحدة التارجت غير صالحة');
    }
    const notes = body.notes?.trim() || null;
    if (notes && notes.length > 500) throw new BadRequestException('الملاحظات بحد أقصى 500 حرف');

    const row = await this.prisma.club_trainer_target_periods.upsert({
      where: {
        trainer_id_period_month: {
          trainer_id: trainerId,
          period_month: periodMonth,
        },
      },
      create: {
        trainer_id: trainerId,
        period_month: periodMonth,
        period_start: start,
        period_end: end,
        target_value: targetValue,
        target_unit: targetUnit,
        notes,
        created_by: user.sub,
        updated_by: user.sub,
      },
      update: {
        target_value: targetValue,
        target_unit: targetUnit,
        notes,
        updated_by: user.sub,
      },
    });
    return this.map(row);
  }

  private monthBounds(periodMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
      throw new BadRequestException('الشهر يجب أن يكون بالصيغة YYYY-MM');
    }
    const [year, month] = periodMonth.split('-').map(Number);
    const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${periodMonth}-01`,
      end: `${periodMonth}-${String(finalDay).padStart(2, '0')}`,
    };
  }

  async assertAccess(trainerId: number, user: JwtUser) {
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true, employee_id: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    if (user.level === 1) return;
    if (!trainer.employee_id) {
      throw new ForbiddenException('لا يمكن إدارة تارجت مدرب غير مرتبط بموظف من هذا الحساب');
    }
    const employee = await this.prisma.employees.findUnique({
      where: { id: trainer.employee_id },
      select: { branch_id_fk: true },
    });
    if (!employee?.branch_id_fk || !this.scope.isBranchAllowed(user, employee.branch_id_fk)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private map(row: TargetPeriodRow) {
    return {
      id: row.id,
      trainerId: row.trainer_id,
      periodMonth: row.period_month,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      targetValue: Number(row.target_value),
      targetUnit: row.target_unit === 'money' ? 'money' as const : 'members' as const,
      notes: row.notes,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
