import { ClubTrainersService } from './club-trainers.service';

describe('ClubTrainersService audience scope', () => {
  it('maps the women audience to employee type and applies it before trainer pagination/count', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 20 }]) },
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ClubTrainersService(prisma as never, {} as never);

    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25 } as never, [3], 'female');

    expect(prisma.employees.findMany).toHaveBeenCalledWith({
      where: { branch_id_fk: { in: [3] }, emp_type: 2 },
      select: { id: true },
    });
    const where = { AND: [{ is_deleted: false }, { employee_id: { in: [20] } }] };
    expect(prisma.club_trainers.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.club_trainers.count).toHaveBeenCalledWith({ where });
  });

  it('fails closed when a scoped audience has no matching employee-linked trainers', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ClubTrainersService(prisma as never, {} as never);
    await service.statistics(null, 'male');
    expect(prisma.employees.findMany).toHaveBeenCalledWith({
      where: { emp_type: 1 },
      select: { id: true },
    });
    expect(prisma.club_trainers.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employee_id: { in: [] } }),
    }));
  });
});
