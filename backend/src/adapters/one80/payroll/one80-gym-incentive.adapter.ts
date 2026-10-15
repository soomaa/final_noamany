import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  GymIncentiveAdapter,
  GymIncentiveInput,
} from '../../../ports/payroll/gym-incentive.adapter';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const decimal = (value: unknown) => Number(value ?? 0);

@Injectable()
export class One80GymIncentiveAdapter implements GymIncentiveAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(input: GymIncentiveInput): Promise<number> {
    const users = await this.prisma.users.findMany({
      where: { emp_code: input.employeeId },
      select: { user_id: true },
    });
    const userIds = users.map((user) => user.user_id);
    const createdBy = userIds.length ? { in: userIds } : { in: [-1] };
    const settings = await this.prisma.tbl_gym_setting.findMany({
      select: { ttype: true, for_user: true },
    });
    const rate = (type: 'target' | 'proten' | 'classes') =>
      Number(settings.find((setting) => setting.ttype === type)?.for_user ?? 0) / 100;
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { employee_id: input.employeeId, is_deleted: false, is_active: true },
      select: { id: true },
    });
    const trainerOwnsReceipts = trainer != null;
    const emptyReceipts = { _sum: { amount: 0, paid_amount: 0, collected_amount: 0 } };
    const [targetReceipts, lockers, sales, classReceipts] = await Promise.all([
      trainerOwnsReceipts
        ? Promise.resolve(emptyReceipts)
        : this.prisma.club_receipts.aggregate({
            where: {
              receipt_date: { gte: input.fromDate, lte: input.toDate },
              status: { in: ['مدفوعة', 'paid'] },
              subscription: { is: { is_special: false, type: { is: { is_part_of_target: true } }, OR: [{ employee_id: input.employeeId }, { created_by: createdBy }] } },
            },
            _sum: { amount: true },
          }),
      this.prisma.club_locker_subscriptions.aggregate({
        where: {
          subscription_start_date: { gte: input.fromDate, lte: input.toDate },
          OR: [{ recommended_employee_id: input.employeeId }, { created_by: createdBy }],
        },
        _sum: { paid_amount: true },
      }),
      this.prisma.sales_quick_sales.aggregate({
        where: {
          sale_date: { gte: input.fromDate, lte: input.toDate },
          status: 'completed',
          OR: [{ employee_id: input.employeeId }, { created_by: createdBy }],
        },
        _sum: { collected_amount: true },
      }),
      trainerOwnsReceipts
        ? Promise.resolve(emptyReceipts)
        : this.prisma.club_receipts.aggregate({
            where: {
              receipt_date: { gte: input.fromDate, lte: input.toDate },
              status: { in: ['مدفوعة', 'paid'] },
              subscription: { is: { is_special: true, OR: [{ employee_id: input.employeeId }, { created_by: createdBy }] } },
            },
            _sum: { amount: true },
          }),
    ]);
    const targetBase = decimal(targetReceipts._sum.amount) + decimal(lockers._sum.paid_amount);
    return money(
      targetBase * rate('target') +
        decimal(sales._sum.collected_amount) * rate('proten') +
        decimal(classReceipts._sum.amount) * rate('classes'),
    );
  }
}
