jest.mock('./class-enrollment-entitlement', () => ({ eligibleEnrollmentSource: jest.fn().mockResolvedValue(41) }));
import { BadRequestException } from '@nestjs/common';
import { ClubClassesService } from './club-classes.service';

describe('ClubClassesService subscription renewal lifecycle', () => {
  const build = (updatedCount = 1, enrollmentTransitionCount = 1) => {
    const enrollment = { id: 5, class_id: 4, member_id: 9, subscription_id: 41, attendance_status: 'booked' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_classes: { findUnique: jest.fn().mockResolvedValue({ commission_percentage: 50 }) },
      club_class_enrollments: { updateMany: jest.fn().mockResolvedValue({ count: enrollmentTransitionCount }) },
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({ sessions_used: 4, sessions_count: 5, subscription_value: 500, is_linked_to_sessions: true }),
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
        update: jest.fn(),
      },
    };
    const prisma = {
      club_class_enrollments: { findUnique: jest.fn().mockResolvedValue(enrollment) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const lifecycle = {
      promoteAfterQuotaExhaustion: jest.fn().mockResolvedValue({ activatedSubscriptionId: 42 }),
      syncActivatedMember: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ClubClassesService(
      prisma as never, {} as never, {} as never, {} as never,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as never, lifecycle as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ branchId: 2 } as never);
    jest.spyOn(service as never, 'assertMemberInBranch').mockResolvedValue(undefined as never);
    return { service, tx, lifecycle };
  };

  it('atomically consumes the final class session and activates the queued renewal', async () => {
    const { service, tx, lifecycle } = build();
    await service.updateAttendance(4, 9, { attendanceStatus: 'attended' });
    expect(tx.club_subscriptions.updateMany).toHaveBeenCalledWith({
      where: { id: 41, sessions_used: 4, sessions_count: 5, is_linked_to_sessions: true },
      data: { sessions_used: { increment: 1 } },
    });
    expect(lifecycle.promoteAfterQuotaExhaustion).toHaveBeenCalledWith(41, expect.any(String), tx);
    expect(lifecycle.syncActivatedMember).toHaveBeenCalledWith(42);
  });

  it('rejects a concurrent final-session consume that lost the atomic update', async () => {
    const { service, lifecycle } = build(0);
    await expect(service.updateAttendance(4, 9, { attendanceStatus: 'attended' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(lifecycle.promoteAfterQuotaExhaustion).not.toHaveBeenCalled();
  });

  it('does not consume quota when another request already changed attendance', async () => {
    const { service, tx, lifecycle } = build(1, 0);
    await service.updateAttendance(4, 9, { attendanceStatus: 'attended' });
    expect(tx.club_subscriptions.updateMany).not.toHaveBeenCalled();
    expect(lifecycle.promoteAfterQuotaExhaustion).not.toHaveBeenCalled();
  });
});
