import { RevenuesService } from './revenues.service';

it('prevents editing a generated hospitality recovery independently from its statement', async () => {
  const prisma = { fin_revenues: { findFirst: jest.fn().mockResolvedValue({ id: 1, branch_id: 1, source_module: 'hospitality_settlement' }) }, $transaction: jest.fn() };
  const service = new RevenuesService(prisma as never, {} as never, { isBranchAllowed: () => true } as never, {} as never);
  await expect(service.update(1, { amount: 10 }, 9)).rejects.toThrow('مصدرها');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
