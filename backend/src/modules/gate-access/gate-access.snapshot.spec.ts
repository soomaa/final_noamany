import { GateAccessService } from './gate-access.service';

describe('gate snapshot QR credential compatibility', () => {
  it('exports only active canonical Wiegand-26 credentials, without changing stored values', async () => {
    const credentialRows = [
      { credential_no: '1234567', is_active: true },
      { credential_no: '7654321', is_active: false },
      { credential_no: '0123456', is_active: true },
      { credential_no: 'A00001', is_active: true },
      { credential_no: '16777216', is_active: true },
      { credential_no: '0', is_active: true },
      { credential_no: '16777215', is_active: true },
    ];
    const prisma = {
      gate_controllers: { findUnique: jest.fn().mockResolvedValue({ id: 1, branch_id: 4, entry_door_no: 1, exit_door_no: 2 }) },
      club_members: { findMany: jest.fn().mockResolvedValue(credentialRows.map((_, id) => ({ id: id + 1, name: `Member ${id}`, member_code: `A${id}` }))) },
    };
    const credentials = { ensureForMember: jest.fn(async (id: number) => credentialRows[id - 1]) };
    const entitlement = { validate: jest.fn().mockResolvedValue({ allowed: true, activeSubscription: { startDate: '2026-09-01', endDate: '2026-09-30', isTimeBased: false } }) };
    const service = new GateAccessService(prisma as never, credentials as never, entitlement as never, {} as never, {} as never);
    const result = await service.snapshot(1);
    expect(result.users.map((user) => user.cardNo)).toEqual(['1234567', '16777215']);
  });
});
