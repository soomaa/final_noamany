import { GateAccessService } from './gate-access.service';

describe('expired gate entry cannot be reopened', () => {
  function setup() {
    const controller = { id: 1, branch_id: 2, name: 'Demo', model: 'C3-200', is_active: true,
      entry_door_no: 1, exit_door_no: 2, last_seen_at: new Date(), status: 'online' };
    const db = { gate_controllers: { findUnique: jest.fn().mockResolvedValue(controller) },
      gate_events: { findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 1n, ...data })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 1n, ...data })) },
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 1, member_code: 'DEMO', name: 'Demo' }]) } };
    const credentials = { findActive: jest.fn().mockResolvedValue({ member: { id: 1, branch_id: 2 } }),
      findForEntryAlert: jest.fn().mockResolvedValue({ member: { id: 1, branch_id: 2 } }),
      ensureForMember: jest.fn().mockResolvedValue({ credential_no: '1234567', is_active: true }) };
    const denial = { allowed: false, reasons: [{ code: 'no_active_subscription', messageAr: 'الاشتراك منتهي' }], warnings: [], activeSubscription: null };
    const entitlement = { usableSubscriptions: jest.fn().mockResolvedValue([]), validate: jest.fn().mockResolvedValue(denial) };
    const attendance = { recentCheckIn: jest.fn().mockResolvedValue({ id: 5 }), checkIn: jest.fn(),
      checkOut: jest.fn().mockResolvedValue({ id: 5 }), recordPendingGateEntry: jest.fn(),
      reportEntryAlert: jest.fn().mockResolvedValue(undefined) };
    const service = new GateAccessService(db as never, credentials as never, entitlement as never,
      attendance as never, { isBranchAllowed: () => true } as never);
    return { service, attendance, credentials, entitlement };
  }
  it.each([27, 1, 3])('never opens expired entry with a recent visit (controller event %s)', async (eventType) => {
    const { service, attendance } = setup();
    const result = await service.ingestEvent(1, { fingerprint: 'b'.repeat(64), occurredAt: new Date().toISOString(),
      credentialNo: '1234567', doorNo: 1, eventType });
    expect(result.accepted).toBe(false);
    expect(result.openDoor).toBe(false);
    expect(attendance.checkIn).not.toHaveBeenCalled();
    expect(attendance.recordPendingGateEntry).not.toHaveBeenCalled();
    expect(attendance.reportEntryAlert).toHaveBeenCalledWith(expect.objectContaining({ memberId: 1,
      branchId: 2, source: 'gate', severity: 'block', message: 'الاشتراك منتهي' }));
  });
  it('identifies an inactive member for reception without authorizing the credential', async () => {
    const { service, credentials, attendance } = setup();
    credentials.findActive.mockResolvedValue(null);
    const result = await service.ingestEvent(1, { fingerprint: 'c'.repeat(64), occurredAt: new Date().toISOString(),
      credentialNo: '1234567', doorNo: 1, eventType: 27 });
    expect(result.openDoor).toBe(false);
    expect(attendance.reportEntryAlert).toHaveBeenCalled();
  });
  it('keeps exits open without applying expiry or payment checks', async () => {
    const { service, entitlement, attendance } = setup();
    const result = await service.ingestEvent(1, { fingerprint: 'd'.repeat(64), occurredAt: new Date().toISOString(),
      credentialNo: '1234567', doorNo: 2, eventType: 27 });
    expect(result.openDoor).toBe(true);
    expect(entitlement.validate).not.toHaveBeenCalled();
    expect(attendance.reportEntryAlert).not.toHaveBeenCalled();
  });
  it('cuts the offline authorization off on the last grace day', async () => {
    const { service, entitlement } = setup();
    entitlement.validate.mockResolvedValue({ allowed: true, reasons: [], warnings: [], accessValidUntil: '2026-10-07',
      activeSubscription: { startDate: '2026-10-01', endDate: '2026-10-31', specialClassTypeId: null,
        isLinkedToSessions: false, isTimeBased: false } } as never);
    const snapshot = await service.snapshot(1);
    expect(snapshot.users).toHaveLength(1);
    expect(snapshot.users[0].endDate).toBe('20261007');
  });
});
