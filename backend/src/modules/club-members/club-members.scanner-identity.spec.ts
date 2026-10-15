import { ClubMembersService } from './club-members.service';

function makeService(prisma: Record<string, unknown>) {
  return new ClubMembersService(
    prisma as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {
      isBranchAllowed: jest.fn().mockReturnValue(true),
      resolveListFilter: jest.fn().mockReturnValue(null),
    } as never,
    {} as never,
  );
}

describe('ClubMembersService scanner identity', () => {
  it('resolves an exact active scanner credential without dropping leading zeroes', async () => {
    const member = { id: 19, member_code: 'A000019', branch_id: 1 };
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          { ...member, card_number: null, gate_credential: { credential_no: '0246999', is_active: true } },
        ]),
      },
    };
    const service = makeService(prisma);

    await expect(service.resolveByIdOrCode(undefined, ' 0246999 ')).resolves.toEqual({
      ...member,
      card_number: null,
    });
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_deleted: false,
          OR: [
            { member_code: '0246999' },
            { card_number: '0246999' },
            {
              gate_credential: {
                is: { credential_no: '0246999', is_active: true },
              },
            },
          ],
        },
      }),
    );
  });

  it('stores and returns the trimmed scanner credential when creating a member', async () => {
    const row = {
      id: 19,
      member_code: 'A000019',
      name: 'عضو سكانر',
      phone: null,
      email: null,
      gender: 'male',
      card_number: null,
      date_of_birth: null,
      address: null,
      marital_status: null,
      job_title: null,
      profile_picture: null,
      branch_id: 1,
      membership_type_id: null,
      start_date: null,
      end_date: null,
      notes: null,
      is_active: true,
      is_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_by: null,
      sales_id: null,
      employee_id: null,
      guardian_name: null,
      guardian_phone: null,
      app_user_id: null,
      is_deleted: false,
      created_by: 9,
      created_at: new Date(),
      updated_at: new Date(),
      membership_type: null,
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ maxNum: 18 }])
        .mockResolvedValueOnce([]),
      club_members: { create: jest.fn().mockResolvedValue(row) },
      gate_credentials: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(null) },
      gate_credentials: { findUnique: jest.fn().mockResolvedValue(null) },
      tbl_branches: {
        findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }),
      },
      club_membership_types: { findUnique: jest.fn() },
      employees: { findUnique: jest.fn().mockResolvedValue(null) },
      department_jobs: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = makeService(prisma);

    const result = await service.create(
      {
        branchId: 1,
        name: 'عضو سكانر',
        phone: '',
        gender: 'male',
        scannerCode: ' 0246999 ',
        autoCreateUser: false,
      } as never,
      { sub: 9, branch: 1, emp_code: null, name: 'الاستقبال' } as never,
    );

    expect(tx.gate_credentials.upsert).toHaveBeenCalledWith({
      where: { member_id: 19 },
      create: { member_id: 19, credential_no: '0246999', is_active: true },
      update: { credential_no: '0246999', is_active: true },
    });
    expect(result.member).toEqual(expect.objectContaining({ scannerCode: '0246999' }));
  });

  it('removes the scanner credential atomically when it is cleared during update', async () => {
    const existing = {
      id: 19,
      member_code: 'A000019',
      name: 'عضو سكانر',
      phone: null,
      email: null,
      gender: 'male',
      card_number: null,
      date_of_birth: null,
      address: null,
      marital_status: null,
      job_title: null,
      profile_picture: null,
      branch_id: 1,
      membership_type_id: null,
      start_date: null,
      end_date: null,
      notes: null,
      is_active: true,
      is_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_by: null,
      sales_id: null,
      employee_id: null,
      guardian_name: null,
      guardian_phone: null,
      app_user_id: null,
      created_by: 9,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const tx = {
      club_members: {
        update: jest.fn().mockResolvedValue({
          ...existing,
          membership_type: null,
          gate_credential: { credential_no: '0246999', is_active: true },
        }),
      },
      gate_credentials: {
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = makeService(prisma);

    const result = await service.update(19, { scannerCode: '' } as never);

    expect(tx.gate_credentials.deleteMany).toHaveBeenCalledWith({
      where: { member_id: 19 },
    });
    expect(tx.gate_credentials.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ scannerCode: null }));
  });
});
