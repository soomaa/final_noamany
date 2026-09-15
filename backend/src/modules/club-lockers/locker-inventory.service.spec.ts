import { ForbiddenException } from '@nestjs/common';
import { LockerInventoryService } from './locker-inventory.service';

describe('LockerInventoryService', () => {
  const prisma = {
    club_locker_inventory_sessions: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    club_locker_inventory_lines: { upsert: jest.fn(), findMany: jest.fn() },
    club_lockers: { findUnique: jest.fn() },
  };
  const branches = { isBranchAllowed: jest.fn().mockReturnValue(true) };
  let service: LockerInventoryService;

  beforeEach(() => { jest.resetAllMocks(); branches.isBranchAllowed.mockReturnValue(true); service = new LockerInventoryService(prisma as never, branches as never); });

  it('creates inventory as a branch-scoped draft', async () => {
    prisma.club_locker_inventory_sessions.findFirst.mockResolvedValue(null);
    prisma.club_locker_inventory_sessions.create.mockResolvedValue({ id: 4, status: 'draft' });
    await service.createDraft({ branchId: 2, inventoryDate: '2026-09-09' }, { sub: 10, branchIds: [2] } as never);
    expect(branches.isBranchAllowed).toHaveBeenCalledWith(expect.anything(), 2);
    expect(prisma.club_locker_inventory_sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'draft', branch_id: 2, inventory_date: new Date('2026-09-09T00:00:00.000Z') }),
    }));
  });

  it('does not finalize another branch\'s draft', async () => {
    branches.isBranchAllowed.mockReturnValue(false);
    prisma.club_locker_inventory_sessions.findUnique.mockResolvedValue({ id: 4, branch_id: 2, status: 'draft' });
    await expect(service.finalize(4, { sub: 10, branchIds: [3] } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires finalized state before a reviewer can approve a session', async () => {
    prisma.club_locker_inventory_sessions.findUnique.mockResolvedValue({ id: 4, branch_id: 2, status: 'draft' });
    await expect(service.review(4, 'approve', { sub: 20, branchIds: [2] } as never)).rejects.toThrow('اعتماد');
  });

  it('rejects a line whose locker belongs to another branch', async () => {
    prisma.club_locker_inventory_sessions.findUnique.mockResolvedValue({ id: 10, branch_id: 2, status: 'draft' });
    prisma.club_lockers.findUnique.mockResolvedValue({ id: 99, main_branch_id: 7, sub_branch_id: 7 });

    await expect(service.upsertLine(10, { lockerId: 99, actualStatus: 'available' }, { sub: 1 } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_locker_inventory_lines.upsert).not.toHaveBeenCalled();
  });

  it('lists inventory sessions using the signed-in user branch scope when no branch filter is sent', async () => {
    (branches as any).resolveListFilter = jest.fn().mockReturnValue([2]);
    prisma.club_locker_inventory_sessions.findMany.mockResolvedValue([]);

    await service.list({}, { sub: 1, branch: 2 } as never);

    expect(prisma.club_locker_inventory_sessions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [2] } }),
    }));
  });
});
