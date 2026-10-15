import { GateAccessService } from './gate-access.service';

function setup(overrides = {}) {
  const row = { id: 1, branch_id: 4, name: 'Gate', model: 'C3-200', static_ip: '192.168.1.201', port: 4370, entry_door_no: 1, exit_door_no: 2, is_active: true, status: 'online', last_seen_at: new Date(), ...overrides };
  const prisma = {
    gate_controllers: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn().mockImplementation(async ({ data }) => ({ ...row, ...data })), create: jest.fn().mockImplementation(async ({ data }) => ({ ...row, ...data })) },
    tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 4, branch_name: 'Gym' }) },
    gate_commands: { create: jest.fn().mockResolvedValue({ id: 1n, status: 'pending' }), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    gate_events: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 1n, ...data })) },
  };
  const attendance = { reportEntryAlert: jest.fn().mockResolvedValue(undefined), checkOut: jest.fn().mockResolvedValue({ id: 7 }), checkIn: jest.fn() };
  const credentials = { findActive: jest.fn().mockResolvedValue({ member: { id: 5 } }) };
  const scope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
  return { prisma, attendance, scope, service: new GateAccessService(prisma as never, credentials as never, {} as never, attendance as never, scope as never) };
}

describe('gate configuration and safe commands', () => {
  it('updates the existing model and supports entry-only InBio160 without rotating credentials', async () => {
    const { service, prisma } = setup();
    const result = await service.updateController(1, { model: 'INBIO160-PRO', entryDoorNo: 1, exitDoorNo: 0 } as never);
    expect(result.model).toBe('INBIO160-PRO');
    expect(result.exitDoorNo).toBe(0);
    expect(prisma.gate_controllers.update.mock.calls[0][0].data.agent_token_hash).toBeUndefined();
  });
  it('rejects a second relay on InBio160', async () => {
    const { service, prisma } = setup();
    await expect(service.createController({ name: 'Gate', branchId: 4, staticIp: '192.168.1.202', model: 'INBIO160-PRO', exitDoorNo: 2 })).rejects.toThrow();
    expect(prisma.gate_controllers.create).not.toHaveBeenCalled();
  });
  it('does not silently configure an attendance terminal as a Pull controller', async () => {
    const { service } = setup();
    await expect(service.createController({ name: 'Gate', branchId: 4, staticIp: '192.168.1.201', model: 'MB20' })).rejects.toThrow();
  });
  it('rejects creating or moving a controller outside the user branch scope', async () => {
    const { service, scope } = setup();
    scope.isBranchAllowed.mockImplementation((_user, branch) => branch === 4);
    await expect((service.createController as (...args: any[]) => Promise<unknown>).call(service, { name: 'Gate', branchId: 9, staticIp: '192.168.1.201' }, { sub: 2 } as never)).rejects.toThrow();
    await expect(service.updateController(1, { branchId: 9 }, { sub: 2 } as never)).rejects.toThrow();
  });
  it.each([{ status: 'controller_offline' }, { last_seen_at: new Date(0) }])('does not queue delayed physical opens for an offline controller: %s', async (row) => {
    const { service, prisma } = setup(row);
    await expect(service.queueOpenDoor(1, { doorNo: 1 })).rejects.toThrow();
    expect(prisma.gate_commands.create).not.toHaveBeenCalled();
  });
  it('uses the reader direction when entry and exit share one relay', async () => {
    const { service, attendance } = setup({ model: 'INBIO160-PRO', exit_door_no: 1 });
    await service.ingestEvent(1, { fingerprint: 'test', occurredAt: new Date().toISOString(), credentialNo: '123', doorNo: 1, eventType: 0, inOutState: 1 });
    expect(attendance.checkOut).toHaveBeenCalled();
    expect(attendance.checkIn).not.toHaveBeenCalled();
  });
  it('does not pulse a door when replaying an old exit lookup', async () => {
    const { service } = setup();
    const result = await service.ingestEvent(1, { fingerprint: 'old', occurredAt: '2026-01-01T10:00:00Z', credentialNo: '123', doorNo: 2, eventType: 27 });
    expect(result.openDoor).toBe(false);
  });
  it('expires queued opens before retrieving commands after reconnection', async () => {
    const { service, prisma } = setup();
    await service.takeCommands(1);
    expect(prisma.gate_commands.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ controller_id: 1, status: 'pending', created_at: expect.any(Object) }), data: expect.objectContaining({ status: 'failed' }) }));
    expect(prisma.gate_commands.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ created_at: expect.any(Object) }) }));
  });
});

describe('live QR authorization', () => {
  function online(allowed: boolean) {
    const prisma = {
      gate_controllers: { findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Gate', model: 'INBIO160-PRO', branch_id: 4, entry_door_no: 1, exit_door_no: 0, is_active: true }) },
      gate_events: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1n }) },
    };
    const attendance = { reportEntryAlert: jest.fn().mockResolvedValue(undefined),
      checkIn: jest.fn().mockResolvedValue({ attendance: { id: 8 } }),
      recentCheckIn: jest.fn().mockResolvedValue(null),
      hasClassForSubscriptionAt: jest.fn().mockResolvedValue(true),
      recordPendingGateEntry: jest.fn(),
    };
    const credentials = { findActive: jest.fn().mockResolvedValue({ member: { id: 5 } }) };
    const verdict = { allowed, reasons: allowed ? [] : [{ code: 'expired', messageAr: 'Expired subscription' }], activeSubscription: { id: 30, specialClassTypeId: null } };
    const entitlement = { validate: jest.fn().mockResolvedValue(verdict), usableSubscriptions: jest.fn().mockResolvedValue([verdict]) };
    return { attendance, service: new GateAccessService(prisma as never, credentials as never, entitlement as never, attendance as never, {} as never) };
  }
  it.each([true, false])('opens and records a live unknown-card QR only for eligible membership (%s)', async (allowed) => {
    const { service, attendance } = online(allowed);
    const result = await service.ingestEvent(1, { fingerprint: 'live', occurredAt: new Date().toISOString(), credentialNo: '123', doorNo: 1, eventType: 27, inOutState: 0 });
    expect(result.openDoor).toBe(allowed);
    expect(attendance.checkIn).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
  it('does not turn a delayed unsuccessful scan into attendance', async () => {
    const { service, attendance } = online(true);
    const result = await service.ingestEvent(1, { fingerprint: 'late', occurredAt: new Date(Date.now() - 60_000).toISOString(), credentialNo: '123', doorNo: 1, eventType: 27 });
    expect(result.openDoor).toBe(false);
    expect(result.reasonCode).toBe('expired_lookup');
    expect(attendance.checkIn).not.toHaveBeenCalled();
  });
});
