import { isTrainerJobTitle, jobCountsAsTrainer, syncAllEmployeeTrainers, syncEmployeeTrainer } from './trainer-sync.util';

function db(job: { is_trainer: boolean; name: string }, emp: Record<string, unknown>, existing: Record<string, unknown> | null = null) {
  return {
    employees: {
      findUnique: jest.fn().mockResolvedValue({ id: 7, employee: 'منار احمد', phone: null, email: null, leave_emp: 0, mosma_wazefy_code: 99, ...emp }),
      findMany: jest.fn().mockResolvedValue([{ id: 7 }]),
    },
    department_jobs: {
      findUnique: jest.fn().mockResolvedValue(job),
      findMany: jest.fn().mockResolvedValue([{ id: 99, ...job }, { id: 5, name: 'محاسب', is_trainer: false }]),
    },
    club_trainers: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 500 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('captain job titles link to a coach record (client, 23 Nov)', () => {
  it('any title with كابتن counts, even without the مدرب flag', () => {
    expect(isTrainerJobTitle('كابتن حريمي')).toBe(true);
    expect(isTrainerJobTitle('Coach')).toBe(true);
    expect(isTrainerJobTitle('مدرب')).toBe(true);
    expect(isTrainerJobTitle('مدير فرع')).toBe(false);
    expect(jobCountsAsTrainer({ is_trainer: false, name: 'كابتن رجالي' })).toBe(true);
    expect(jobCountsAsTrainer({ is_trainer: false, name: 'ريسيبشن' })).toBe(false);
  });

  it('creates the coach record for an unflagged «كابتن حريمي» employee', async () => {
    const prisma = db({ is_trainer: false, name: 'كابتن حريمي' }, {});
    await expect(syncEmployeeTrainer(prisma as never, 7)).resolves.toBe(500);
    expect(prisma.club_trainers.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employee_id: 7, name: 'منار احمد', is_active: true }) });
  });

  it('a deleted captain (leave_emp=1) is hidden, not deleted', async () => {
    const prisma = db({ is_trainer: true, name: 'كابتن' }, { leave_emp: 1 }, { id: 500, is_active: true });
    await syncEmployeeTrainer(prisma as never, 7);
    expect(prisma.club_trainers.update).toHaveBeenCalledWith({ where: { id: 500 }, data: { is_active: false } });
    expect(prisma.club_trainers.create).not.toHaveBeenCalled();
  });

  it('the full sync picks up unflagged captain titles', async () => {
    const prisma = db({ is_trainer: false, name: 'كابتن حريمي' }, {});
    await syncAllEmployeeTrainers(prisma as never);
    expect(prisma.employees.findMany).toHaveBeenCalledWith({ where: { mosma_wazefy_code: { in: [99] } }, select: { id: true } });
  });
});
