import { BranchesService } from './branches.service';

describe('BranchesService scoped options', () => {
  it('returns only branches allowed by the authenticated scope', async () => {
    const prisma = { tbl_branches: { findMany: jest.fn().mockResolvedValue([
      { branch_id: 2, branch_name: 'A', from_id: 0 },
    ]) } } as any;
    const scope = { allowedBranchIds: jest.fn().mockReturnValue([2, 4]) } as any;
    const service = new BranchesService(prisma, scope);

    await expect(service.findOptions({ sub: 5, level: 3, branch: 2 } as any)).resolves.toEqual([
      { id: 2, name: 'A', parentId: 0, lat: null, lng: null },
    ]);
    expect(prisma.tbl_branches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { branch_id: { in: [2, 4] } },
    }));
  });

  it('fails closed to an empty query for an unassigned non-admin', async () => {
    const prisma = { tbl_branches: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const scope = { allowedBranchIds: jest.fn().mockReturnValue([]) } as any;
    const service = new BranchesService(prisma, scope);
    await service.findOptions({ sub: 5, level: 3, branch: 0 } as any);
    expect(prisma.tbl_branches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { branch_id: { in: [] } },
    }));
  });
});
