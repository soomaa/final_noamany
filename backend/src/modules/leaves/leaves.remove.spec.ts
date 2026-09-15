import { LeavesService } from './leaves.service';

describe('LeavesService remove', () => {
  const prisma = {
    hr_all_agzat_orders: { findUnique: jest.fn(), delete: jest.fn() },
    hr_all_agzat_attaches: { deleteMany: jest.fn() },
    hr_all_agzat_history: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new LeavesService(prisma as never) as unknown as {
    remove: (id: number, actor: { sub: number; level: number }) => Promise<{ id: number }>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hr_all_agzat_orders.findUnique.mockResolvedValue({ id: 44, publisher: 17, suspend: 0 });
    prisma.hr_all_agzat_attaches.deleteMany.mockResolvedValue({ count: 0 });
    prisma.hr_all_agzat_history.deleteMany.mockResolvedValue({ count: 1 });
    prisma.hr_all_agzat_orders.delete.mockResolvedValue({ id: 44 });
    prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('permanently removes an unreviewed request and its related leave records for its owner', async () => {
    await expect(service.remove(44, { sub: 17, level: 2 })).resolves.toEqual({ id: 44 });

    expect(prisma.hr_all_agzat_attaches.deleteMany).toHaveBeenCalledWith({ where: { talab_id_fk: 44 } });
    expect(prisma.hr_all_agzat_history.deleteMany).toHaveBeenCalledWith({ where: { agaza_id_fk: 44 } });
    expect(prisma.hr_all_agzat_orders.delete).toHaveBeenCalledWith({ where: { id: 44 } });
  });
});
