import { ClubClassesService } from './club-classes.service';
import { localDateString } from './club-fitness.utils';

function fixture() {
  const prisma = {
    club_classes: { findMany: jest.fn().mockResolvedValue([{
      id: 1, class_name: 'زومبا', class_date: '2026-10-01', start_time: '17:00', end_time: '18:00', trainer_id: 9,
      class_type_id: 2, class_type: { id: 2, name: 'زومبا', color: '#2563EB' }, trainer: { name: 'رامي', employee_id: 44 },
      status: 'scheduled', commission_percentage: 50, price: 250,
      enrollments: [
        { id: 4, member_id: 8, subscription_id: 3, attendance_status: 'attended', session_value_snapshot: 100, commission_percentage_snapshot: 50, package_value_snapshot: 1200, package_sessions_snapshot: 12 },
        { id: 5, member_id: 10, subscription_id: null, attendance_status: 'booked' },
      ],
    }]), findFirst: jest.fn().mockResolvedValue({ id: 1, branch_id: 2, class_date: localDateString(), status: 'scheduled', allow_external: true, price: 250, audience: 'men' }) },
    club_members: { findMany: jest.fn().mockResolvedValue([{ id: 8, name: 'عضو', member_code: 'A008' }]) },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([{ id: 3, subscription_number: 'S3', subscription_type: 'باقة 12 حصة', subscription_value: 9999, sessions_count: 99 }]) },
    club_trainer_salaries: { findMany: jest.fn().mockResolvedValue([]) },
    club_class_guest_attendance: { findMany: jest.fn().mockResolvedValue([{ id: 6, class_id: 1, name: 'ضيف', amount: 250, commission_percentage: 50, receipt_id: 7 }]) },
    $transaction: jest.fn(),
  };
  const service = new ClubClassesService(prisma as never, {} as never, {} as never, {} as never,
    { isBranchAllowed: () => true, resolveListFilter: () => [2] } as never, {} as never, {} as never, {} as never);
  return { prisma, service };
}

describe('class history report and guest payment boundaries', () => {
  it('lists real attendees, immutable package values and guest receipts with per-session commission', async () => {
    const { service } = fixture();
    const result = await service.managementReports({ trainerId: 9 });
    expect(result.sessionHistory[0]).toMatchObject({ attendance: 2, revenue: 350, commission: 175 });
    expect(result.sessionHistory[0].attendees[0]).toMatchObject({ memberName: 'عضو', sessionValue: 100, packageValue: 1200, packageSessions: 12, historicalEstimate: false });
    expect(result.sessionHistory[0].attendees[1]).toMatchObject({ subscriptionNumber: 'إيصال #7', sessionValue: 250, commission: 125 });
    expect(result.summary.revenue).toBe(350);
    expect(result.trainers[0].commissionValue).toBe(175);
  });
  it.each([{ payments: [] }, { payments: [null] }, { payments: [{ method: 'cash', amount: -1 }] }, { payments: [{ method: 'unknown', amount: 250 }] }])('rejects invalid guest tender rows before writing', async ({ payments }) => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValue([]);
    await expect(service.receptionAttendance(1, { identifier: '01012345678', name: 'ضيف', gender: 'male', payments }, { sub: 1 } as never)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects partial guest payment', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValue([]);
    await expect(service.receptionAttendance(1, { identifier: '01012345678', name: 'ضيف', gender: 'male', payments: [{ method: 'cash', amount: 200 }] }, { sub: 1 } as never)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('creates a paid guest receipt and posts each tender in the same transaction', async () => {
    const { prisma } = fixture();
    prisma.club_members.findMany.mockResolvedValue([]);
    const tx = {
      $queryRaw: jest.fn(),
      club_classes: { findUnique: jest.fn().mockResolvedValue({ id: 1, class_date: localDateString(), status: 'scheduled', allow_external: true, price: 250, commission_percentage: 50 }) },
      club_class_guest_attendance: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      club_receipts: { create: jest.fn().mockResolvedValue({ id: 7, receipt_number: 'R7' }) },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const receipts = { nextReceiptNumber: jest.fn().mockResolvedValue('R7') };
    const ledger = { postOtherRevenue: jest.fn() };
    const service = new ClubClassesService(prisma as never, {} as never, {} as never, {} as never,
      { isBranchAllowed: () => true } as never, {} as never, receipts as never, ledger as never);
    const body = { identifier: '01012345678', name: 'ضيف', gender: 'male', payments: [{ method: 'cash', amount: 100 }, { method: 'visa', amount: 150 }] };
    await expect(service.receptionAttendance(1, body, { sub: 1 } as never)).resolves.toMatchObject({ receiptNumber: 'R7' });
    expect(tx.club_receipts.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 250, status: 'مدفوعة', created_by: 1 }) }));
    expect(tx.club_class_guest_attendance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 250, commission_percentage: 50, receipt_id: 7 }) }));
    expect(ledger.postOtherRevenue).toHaveBeenCalledTimes(2);
    expect(ledger.postOtherRevenue).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, paymentMethod: 'cash' }), tx);
    tx.club_class_guest_attendance.findUnique.mockResolvedValue({ receipt_id: 7 } as never);
    await expect(service.receptionAttendance(1, body, { sub: 1 } as never)).resolves.toMatchObject({ alreadyAttended: true, receiptId: 7 });
    expect(tx.club_receipts.create).toHaveBeenCalledTimes(1);
    expect(ledger.postOtherRevenue).toHaveBeenCalledTimes(2);
  });
});
