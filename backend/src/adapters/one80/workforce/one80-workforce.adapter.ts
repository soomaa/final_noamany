import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { cairoDateString } from '../../../common/utils/cairo-date';
import {
  WorkforceAdapter,
  WorkforceIdentityExtension,
} from '../../../ports/workforce/workforce.adapter';
import {
  syncAllEmployeeTrainers,
  syncEmployeeTrainer,
} from '../../../modules/club-fitness/trainer-sync.util';

@Injectable()
export class One80WorkforceAdapter implements WorkforceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async identityForEmployee(employeeId: number): Promise<WorkforceIdentityExtension> {
    const trainer = await this.prisma.club_trainers.findUnique({
      where: { employee_id: employeeId },
      select: { id: true, is_active: true, is_deleted: true },
    });
    return {
      providerRecordId:
        trainer?.is_active && !trainer.is_deleted ? trainer.id : null,
    };
  }

  async employeeFormFields(employeeId: number): Promise<Record<string, string>> {
    const trainer = await this.prisma.club_trainers.findUnique({
      where: { employee_id: employeeId },
      select: {
        salaries: {
          where: { is_active: true },
          orderBy: { effective_date: 'desc' },
          take: 1,
          select: { class_commission_percentage: true },
        },
      },
    });
    return {
      class_commission_percentage: trainer?.salaries[0]
        ? String(trainer.salaries[0].class_commission_percentage)
        : '0',
    };
  }

  async syncEmployee(employeeId: number, fields: Record<string, unknown>): Promise<void> {
    const commission = Number(
      fields.class_commission_percentage ?? fields.classCommissionPercentage ?? 0,
    );
    const basicSalary = Number(fields.basic_salary);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      throw new BadRequestException('عمولة الحصص يجب أن تكون بين 0 و100');
    }
    const trainerId = await syncEmployeeTrainer(this.prisma, employeeId);
    if (!trainerId) return;
    const trainer = await this.prisma.club_trainers.findUnique({ where: { id: trainerId } });
    if (!trainer?.is_active) return;
    const active = await this.prisma.club_trainer_salaries.findFirst({
      where: { trainer_id: trainerId, is_active: true },
      orderBy: { effective_date: 'desc' },
    });
    if (active) {
      await this.prisma.club_trainer_salaries.update({
        where: { id: active.id },
        data: { base_salary: basicSalary, class_commission_percentage: commission },
      });
      return;
    }
    await this.prisma.club_trainer_salaries.create({
      data: {
        trainer_id: trainerId,
        base_salary: basicSalary,
        class_commission_percentage: commission,
        subscription_commission_percentage: 0,
        effective_date: cairoDateString(),
        is_active: true,
      },
    });
  }

  async syncAllEmployees(): Promise<void> {
    await syncAllEmployeeTrainers(this.prisma);
  }
}
