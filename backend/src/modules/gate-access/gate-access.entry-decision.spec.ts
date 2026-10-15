import { GateAccessService } from './gate-access.service';

// Ported from PHAROS: one usable subscription checks straight in; several open the gate and
// wait for reception's pick; a repeat scan reopens without another visit or session.
describe('gate entry with one or several subscriptions', () => {
  let service: GateAccessService;
  let db: any;
  let attendance: any;
  let credentials: any;
  let entitlement: any;
  const controller = { id: 1, branch_id: 2, name: 'Gate', model: 'C3-200', is_active: true,
    status: 'online', last_seen_at: new Date(), entry_door_no: 1, exit_door_no: 2 };
  const monthly = { id: 101, startDate: '2026-09-01', endDate: '2026-10-01', specialClassTypeId: null, isLinkedToSessions: false };
  const zumba = { id: 102, startDate: '2026-09-01', endDate: '2026-10-01', specialClassTypeId: 7, isLinkedToSessions: true };
  const usable = (sub: object) => ({ allowed: true, reasons: [], activeSubscription: sub });
  let seq = 0;
  const event = (overrides = {}) => ({ fingerprint: `${'a'.repeat(63)}${(seq++ % 10)}`, occurredAt: new Date().toISOString(),
    credentialNo: '1234567', doorNo: 1, eventType: 27, ...overrides });

  beforeEach(() => {
    db = {
      gate_controllers: { findUnique: jest.fn().mockResolvedValue(controller) },
      gate_events: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 1n, ...data })),
      },
    };
    credentials = { findActive: jest.fn().mockResolvedValue({ member: { id: 1, branch_id: 2, is_active: true, is_deleted: false } }) };
    entitlement = {
      validate: jest.fn().mockResolvedValue({ allowed: true, reasons: [], activeSubscription: monthly }),
      usableSubscriptions: jest.fn().mockResolvedValue([usable(monthly)]),
    };
    attendance = { reportEntryAlert: jest.fn().mockResolvedValue(undefined),
      checkIn: jest.fn().mockResolvedValue({ attendance: { id: 9 } }),
      checkOut: jest.fn().mockResolvedValue({ id: 9 }),
      recentCheckIn: jest.fn().mockResolvedValue(null),
      hasClassForSubscriptionAt: jest.fn().mockResolvedValue(true),
      recordPendingGateEntry: jest.fn().mockResolvedValue({ attendance: { id: 11 } }),
    };
    service = new GateAccessService(db, credentials, entitlement, attendance, { isBranchAllowed: () => true } as any);
  });

  it('checks a member with one usable subscription straight in on that subscription', async () => {
    expect(await service.ingestEvent(1, event())).toMatchObject({ openDoor: true, accepted: true, reasonCode: 'access_granted', doorNo: 1 });
    expect(attendance.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 1, branchId: 2, subscriptionId: 101, consumeSession: true }),
      undefined, expect.any(Date),
    );
    expect(attendance.recordPendingGateEntry).not.toHaveBeenCalled();
  });

  it('opens for several usable subscriptions and leaves the choice to reception', async () => {
    entitlement.usableSubscriptions.mockResolvedValue([usable(monthly), usable(zumba)]);
    expect(await service.ingestEvent(1, event())).toMatchObject({
      openDoor: true, accepted: true, reasonCode: 'access_granted_pending_subscription', doorNo: 1,
    });
    expect(attendance.recordPendingGateEntry).toHaveBeenCalledWith(expect.objectContaining({ memberId: 1, branchId: 2 }));
    // No session may be taken before reception says which subscription it was.
    expect(attendance.checkIn).not.toHaveBeenCalled();
  });

  it('ignores a class package when none of its classes is about to start', async () => {
    entitlement.usableSubscriptions.mockResolvedValue([usable(monthly), usable(zumba)]);
    attendance.hasClassForSubscriptionAt.mockResolvedValue(false);
    expect(await service.ingestEvent(1, event())).toMatchObject({ openDoor: true, reasonCode: 'access_granted' });
    expect(attendance.checkIn).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 101 }), undefined, expect.any(Date));
  });

  it('does not count a subscription the entitlement rules reject', async () => {
    entitlement.usableSubscriptions.mockResolvedValue([
      usable(monthly),
      { allowed: false, reasons: [{ code: 'outside_time_window', messageAr: 'خارج الوقت' }], activeSubscription: zumba },
    ]);
    expect(await service.ingestEvent(1, event())).toMatchObject({ reasonCode: 'access_granted' });
    expect(attendance.recordPendingGateEntry).not.toHaveBeenCalled();
  });

  it('denies with the subscription\'s own reason when none is usable now', async () => {
    entitlement.usableSubscriptions.mockResolvedValue([
      { allowed: false, reasons: [{ code: 'outside_time_window', messageAr: 'الدخول من 8 إلى 12 فقط' }], activeSubscription: monthly },
    ]);
    expect(await service.ingestEvent(1, event())).toMatchObject({
      openDoor: false, accepted: false, reasonCode: 'outside_time_window', reasonMessage: 'الدخول من 8 إلى 12 فقط',
    });
  });

  it('denies a member with no subscription at all, using the entitlement reason', async () => {
    entitlement.usableSubscriptions.mockResolvedValue([]);
    entitlement.validate.mockResolvedValue({ allowed: false, reasons: [{ code: 'no_active_subscription', messageAr: 'لا يوجد اشتراك نشط' }] });
    expect(await service.ingestEvent(1, event())).toMatchObject({ openDoor: false, reasonCode: 'no_active_subscription' });
    expect(attendance.checkIn).not.toHaveBeenCalled();
  });

  it('reopens for a repeat scan without a second visit or session', async () => {
    attendance.recentCheckIn.mockResolvedValue({ id: 55 });
    expect(await service.ingestEvent(1, event())).toMatchObject({ openDoor: true, accepted: true, reasonCode: 'recent_check_in_reopened' });
    expect(attendance.checkIn).not.toHaveBeenCalled();
    expect(attendance.recordPendingGateEntry).not.toHaveBeenCalled();
  });

  it('keeps the door shut when recording the visit fails', async () => {
    attendance.checkIn.mockRejectedValue(new Error('لا توجد حصص متبقية'));
    expect(await service.ingestEvent(1, event())).toMatchObject({ openDoor: false, accepted: false, reasonCode: 'attendance_rejected' });
  });

  it('still lets a member out on the exit reader without checking subscriptions', async () => {
    expect(await service.ingestEvent(1, event({ doorNo: 2 }))).toMatchObject({ accepted: true, openDoor: true, reasonCode: 'exit_allowed' });
    expect(entitlement.usableSubscriptions).not.toHaveBeenCalled();
  });
});
