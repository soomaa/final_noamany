import { BadRequestException } from '@nestjs/common';
import {
  assertNoPayoutConflict,
  classEarningItems,
  computeTrainerEarnings,
  overlappingPaymentsWhere,
  payoutPeriodConflicts,
  salaryAt,
} from './trainer-earnings.util';

describe('trainer-earnings.util', () => {
  const salaries = [
    { effective_date: '2026-01-01', end_date: '2026-09-30', class_commission_percentage: 10 },
    { effective_date: '2026-10-01', end_date: null, class_commission_percentage: 20 },
  ];

  it('picks the compensation record in force on the day', () => {
    expect(salaryAt(salaries, '2026-09-30')?.class_commission_percentage).toBe(10);
    expect(salaryAt(salaries, '2026-10-01')?.class_commission_percentage).toBe(20);
    expect(salaryAt(salaries, '2025-12-31')).toBeNull();
  });

  it('pays group classes for attended members only, never for cancelled classes', () => {
    const items = classEarningItems(
      [
        {
          id: 1, class_name: 'يوجا', class_date: '2026-10-05', status: 'completed', price: 50,
          enrollments: [{ attendance_status: 'attended' }, { attendance_status: 'absent' }, { attendance_status: 'registered' }],
        },
        {
          id: 2, class_name: 'زومبا', class_date: '2026-10-06', status: 'cancelled', price: 50,
          enrollments: [{ attendance_status: 'attended' }],
        },
        {
          id: 3, class_name: 'كروس', class_date: '2026-10-07', status: 'scheduled', price: 50,
          enrollments: [{ attendance_status: 'registered' }],
        },
      ],
      salaries,
    );
    expect(items).toEqual([expect.objectContaining({ classId: 1, attended: 1, revenue: 50, commissionPercentage: 20, amount: 10 })]);
  });

  it('adds snapshotted private-session commissions and ignores subscription receipts', async () => {
    const db = {
      club_classes: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainer_salaries: { findMany: jest.fn().mockResolvedValue(salaries) },
      club_private_attendance_commissions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, subscription_id: 5, attendance_date: '2026-10-02', commission_sequence: 1, revenue_base: 200, commission_percentage: 25, commission_amount: 50, subscription: { subscription_type: 'برايفت', member_id: 9 } },
        ]),
      },
      club_receipts: { findMany: jest.fn() },
    };
    const result = await computeTrainerEarnings(db, 4, '2026-10-01', '2026-10-31');
    expect(result.earned).toBe(50);
    expect(result.privateCommission).toBe(50);
    expect(db.club_receipts.findMany).not.toHaveBeenCalled();
    expect(db.club_classes.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'cancelled' }, class_date: { gte: '2026-10-01', lte: '2026-10-31' } }),
    }));
  });

  it('deducts every payment that covers a day of the period', () => {
    expect(overlappingPaymentsWhere(4, '2026-10-01', '2026-10-31')).toEqual({
      trainer_id: 4,
      OR: [
        { period_from: { not: null, lte: '2026-10-31' }, period_to: { not: null, gte: '2026-10-01' } },
        { period_from: null, payment_date: { gte: '2026-10-01', lte: '2026-10-31' } },
      ],
    });
  });

  it('allows paying the rest of the same period but blocks a partly overlapping one', async () => {
    const db = {
      club_trainer_earning_payments: {
        findMany: jest.fn().mockResolvedValue([
          { period_from: '2026-10-01', period_to: '2026-10-31' },
          { period_from: '2026-10-01', period_to: '2026-10-31' },
        ]),
      },
    };
    await expect(payoutPeriodConflicts(db, 4, '2026-10-01', '2026-10-31')).resolves.toEqual([]);
    const conflicts = await payoutPeriodConflicts(db, 4, '2026-10-15', '2026-11-15');
    expect(conflicts).toEqual([{ periodFrom: '2026-10-01', periodTo: '2026-10-31' }]);
    expect(() => assertNoPayoutConflict(conflicts)).toThrow(BadRequestException);
  });
});
