import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';

describe('ClubMembersService print cards', () => {
  const receptionist = {
    sub: 8,
    level: 2,
    branch: 3,
    job_title: 'ريسبشن',
    man_women_type: 3,
    emp_code: null,
  } as never;

  function makeService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new ClubMembersService(
      { club_members: { findMany, count } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('shows historical barcode and membership cards from the employee branch', async () => {
    const { service, findMany } = makeService();
    const query = { search: 'A3318', page: 1, pageSize: 20, skip: 0, take: 20 } as never;

    await service.list(query, receptionist, true);
    const filters = findMany.mock.calls[0][0].where.AND;

    expect(filters).toContainEqual({ branch_id: { in: [3] } });
    expect(filters).toContainEqual({ OR: [
      { name: { contains: 'A3318' } },
      { member_code: { contains: 'A3318' } },
      { phone: { contains: 'A3318' } },
    ] });
    expect(filters.some((filter: Record<string, unknown>) => 'created_at' in filter)).toBe(false);
    expect(filters.some((filter: Record<string, unknown>) => 'created_by' in filter)).toBe(false);

    await service.list(query, receptionist);
    expect(findMany.mock.calls[1][0].where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ created_at: expect.anything() }),
    ]));
  });

  it('prints a historical barcode range only within the employee branch', async () => {
    const { service, findMany } = makeService();

    await service.barcodeRange('A3318', 'A3318', receptionist);

    expect(findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      is_deleted: false,
      member_code: { gte: 'A3318', lte: 'A3318' },
      branch_id: { in: [3] },
    }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('created_at');
  });
});
