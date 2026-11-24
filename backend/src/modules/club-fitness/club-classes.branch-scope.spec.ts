import { ForbiddenException } from '@nestjs/common';
import { ClubClassesService } from './club-classes.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

const branchUser = { sub: 7, level: 2, branch: 3, man_women_type: 3 } as never;
const admin = { sub: 1, level: 1, branch: 0, man_women_type: 3 } as never;

function makeService(prisma: Record<string, unknown>) {
  return new ClubClassesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { siblingBranchIds: async (id: number) => [id] },
    new BranchScopeService(),
  );
}

const classRow = (branchId: number) => ({
  id: 21,
  branch_id: branchId,
  class_name: 'Yoga',
  max_capacity: 10,
  enrollments: [],
});

describe('ClubClassesService branch isolation', () => {
  it('rejects reading a class of another branch by id (IDOR)', async () => {
    const service = makeService({ club_classes: { findFirst: jest.fn().mockResolvedValue(classRow(4)) } });
    await expect(service.findOne(21, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the class owner branch and system admins', async () => {
    const service = makeService({ club_classes: { findFirst: jest.fn().mockResolvedValue(classRow(3)) } });
    await expect(service.findOne(21, branchUser)).resolves.toEqual(expect.objectContaining({ id: 21, branchId: 3 }));
    const foreign = makeService({ club_classes: { findFirst: jest.fn().mockResolvedValue(classRow(4)) } });
    await expect(foreign.findOne(21, admin)).resolves.toEqual(expect.objectContaining({ branchId: 4 }));
  });

  it('blocks update, delete and enrollment on a foreign-branch class before any write', async () => {
    const update = jest.fn();
    const service = makeService({
      club_classes: { findFirst: jest.fn().mockResolvedValue(classRow(4)), update },
    });
    await expect(service.update(21, { notes: 'x' }, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(21, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.enrollMember(21, 9, {}, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.checkInByBarcode(21, '1001', branchUser)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('pins the class list of a branch user to their branch when no branch is requested', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ club_classes: { findMany, count: jest.fn().mockResolvedValue(0) } });
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, branchUser);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ branch_id: { in: [3] } }]) },
    }));
  });

  it('enrolls a member of the other men/women section (the section is only a screen default)', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const members = { findFirst: jest.fn().mockResolvedValue({ id: 9, name: 'Ali', gender: 'male' }) };
    const tx = {
      club_members: members,
      club_class_enrollments: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const prisma = {
      club_classes: { findFirst: jest.fn().mockResolvedValue({ ...classRow(3), class_date: '2999-01-01' }) },
      club_members: members,
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const service = new ClubClassesService(
      prisma as never,
      { validate: jest.fn().mockResolvedValue({ allowed: true }) } as never,
      {} as never,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as never,
      { siblingBranchIds: async (id: number) => [id] },
      new BranchScopeService(),
    );
    const womenOnly = { sub: 7, level: 2, branch: 3, man_women_type: 2 } as never;
    await expect(service.enrollMember(21, 9, {}, womenOnly)).resolves.toEqual(expect.objectContaining({ id: 21 }));
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ class_id: 21, member_id: 9 }) });
  });
});
