import { BadRequestException } from '@nestjs/common';
import { ShiftSessionsService } from './shift-sessions.service';

describe('ShiftSessionsService secure handover', () => {
  it('does not issue a session before POS eligibility checks pass', async () => {
    const auth = {
      verifyStaffCredentials: jest.fn().mockResolvedValue({ sub: 9, branch: 2, level: 2 }),
      signTokens: jest.fn(),
      logout: jest.fn(),
    };
    const shifts = { eligibleUsers: jest.fn().mockResolvedValue([]) };
    const service = new ShiftSessionsService(
      {} as never,
      {} as never,
      auth as never,
      shifts as never,
      {} as never,
    );

    await expect(
      service.switchShift(
        {
          username: 'staff',
          password: 'password',
          targetShiftId: 1,
          branchId: 2,
          closingBalance: 0,
          transferAmount: 0,
          cashDropAmount: 0,
        },
        7,
        'current-session',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auth.signTokens).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });
});

  it.each(['start', 'handover'])('rejects a shift assigned to a different branch during %s', async (operation) => {
    const prisma = {
      sales_shifts: { findUnique: jest.fn().mockResolvedValue({ id: 1, branch_id: 3, is_active: true }) },
      $transaction: jest.fn(),
    };
    const auth = {
      verifyStaffCredentials: jest.fn().mockResolvedValue({ sub: 9, branch: 2, level: 2 }),
      signTokens: jest.fn(),
      logout: jest.fn(),
    };
    const service = new ShiftSessionsService(prisma as never, {} as never, auth as never,
      { eligibleUsers: jest.fn().mockResolvedValue([{ id: 9 }]) } as never, {} as never);
    const action = operation === 'start'
      ? service.start({ shiftId: 1, branchId: 2, openingBalance: 0 }, 9)
      : service.switchShift({ targetShiftId: 1, branchId: 2, username: 'staff', password: 'password',
          closingBalance: 0, transferAmount: 0, cashDropAmount: 0 }, 7, 'current-session');
    await expect(action).rejects.toThrow('الوردية المحددة غير مرتبطة بهذا الفرع');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auth.signTokens).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });
