import { ClubMembersService } from './club-members.service';

describe('member QR credential provisioning', () => {
  function setup() {
    const rows = [
      { id: 1, member_code: 'A1', gate_credential: null },
      { id: 2, member_code: 'A2', gate_credential: { credential_no: '7654321', is_active: true } },
      { id: 3, member_code: 'A3', gate_credential: { credential_no: '2345678', is_active: false } },
    ];
    const prisma = { club_members: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(3) } };
    const credentials = { ensureForMember: jest.fn().mockResolvedValue({ credential_no: '1234567', is_active: true }) };
    const service = new ClubMembersService(prisma as never, {} as never, { resolveListFilter: () => [4] } as never, {} as never);
    Object.assign(service, { gateCredentials: credentials });
    return { service, prisma, credentials };
  }

  it('allocates only missing credentials on the scoped page when explicitly requested', async () => {
    const { service, prisma, credentials } = setup();
    const result = await service.list({ page: 2, pageSize: 3, skip: 3, take: 3, includeGateCredentials: true } as never);
    expect(result.data.map((row) => row.scannerCode)).toEqual(['1234567', '7654321', null]);
    expect(credentials.ensureForMember).toHaveBeenCalledTimes(1);
    expect(credentials.ensureForMember).toHaveBeenCalledWith(1);
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ is_deleted: false }, { branch_id: { in: [4] } }] }, skip: 3, take: 3,
    }));
  });

  it.each([{}, { forSelect: true, includeGateCredentials: true }])('keeps ordinary lists and selection queries read-only: %j', async (extra) => {
    const { service, credentials } = setup();
    const result = await service.list({ page: 1, pageSize: 3, skip: 0, take: 3, ...extra } as never);
    expect(result.data[0].scannerCode).toBeNull();
    expect(credentials.ensureForMember).not.toHaveBeenCalled();
  });
});
