import { nextDocNumber } from './procurement.utils';

describe('nextDocNumber', () => {
  it('starts parsing after the prefix separator and increments the result', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ maxNum: 41 }]),
    };

    await expect(
      nextDocNumber(prisma as never, 'prc_supplier_invoices', 'invoice_number', 'SINV'),
    ).resolves.toBe('SINV-000042');

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('SUBSTRING(`invoice_number`, 6)'),
      'SINV-%',
    );
  });

  it('supports prefixes that already contain separators', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ maxNum: null }]),
    };

    await expect(
      nextDocNumber(prisma as never, 'prc_requisitions', 'request_number', 'PR-2026', 4),
    ).resolves.toBe('PR-2026-0001');

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('SUBSTRING(`request_number`, 9)'),
      'PR-2026-%',
    );
  });
});
