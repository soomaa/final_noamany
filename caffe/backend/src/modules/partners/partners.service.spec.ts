import { PartnersService } from './partners.service';

describe('PartnersService', () => {
  const baseRow = {
    id: 7,
    partner_code: 'PRT-00007',
    name: 'شريك اختبار',
    phone: '01000000000',
    national_id: null,
    email: null,
    address: null,
    notes: null,
    is_active: true,
    created_by: 1,
    created_at: new Date('2026-07-22T00:00:00Z'),
    updated_at: new Date('2026-07-22T00:00:00Z'),
    phones: [
      { id: 1, partner_id: 7, phone: '01000000000', label: 'جوال', is_primary: true, created_at: new Date(), updated_at: new Date() },
      { id: 2, partner_id: 7, phone: '01100000000', label: 'واتساب', is_primary: false, created_at: new Date(), updated_at: new Date() },
    ],
  };

  it('returns active partner options searchable by name, code and every phone', async () => {
    const prisma = {
      cafe_partners: { findMany: jest.fn().mockResolvedValue([baseRow]) },
    };
    const service = new PartnersService(prisma as never);

    const result = await service.options('010');

    expect(prisma.cafe_partners.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        is_active: true,
        OR: expect.arrayContaining([
          { name: { contains: '010' } },
          { partner_code: { contains: '010' } },
          { phones: { some: { phone: { contains: '010' } } } },
        ]),
      }),
    }));
    expect(result[0]).toMatchObject({ partnerCode: 'PRT-00007', primaryPhone: '01000000000' });
    expect(result[0].phones).toHaveLength(2);
  });

  it('normalizes multiple phones and keeps exactly one primary number', async () => {
    const tx = {
      cafe_partners: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          ...baseRow,
          partner_code: null,
          phone: data.phone,
          phones: data.phones.create.map((phone: Record<string, unknown>, index: number) => ({
            id: index + 1, partner_id: 7, created_at: new Date(), updated_at: new Date(), ...phone,
          })),
        })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...baseRow, partner_code: data.partner_code })),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new PartnersService(prisma as never);

    const result = await service.create({
      name: 'شريك اختبار',
      phones: [
        { phone: '01000000000', label: 'جوال' },
        { phone: '01100000000', label: 'واتساب', isPrimary: true },
      ],
    }, 1);

    const createData = tx.cafe_partners.create.mock.calls[0][0].data;
    expect(createData.phone).toBe('01100000000');
    expect(createData.phones.create.filter((phone: { is_primary: boolean }) => phone.is_primary)).toHaveLength(1);
    expect(result.partnerCode).toBe('PRT-00007');
  });
});
