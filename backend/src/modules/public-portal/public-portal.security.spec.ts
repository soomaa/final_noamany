import { BadRequestException, ConflictException } from '@nestjs/common';
import { PublicPortalService } from './public-portal.service';

describe('Public portal checkout and account boundaries', () => {
  const checkout = { fullName: 'Test Customer', phone: '01012345678', governorate: 'Cairo', cityStreet: 'Test street', items: [{ productId: 1, quantity: 2 }] };
  function setup() {
    const tx = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        if (sql.includes('FROM products')) return [{ id: 1, name: 'Product', current_stock: 3, stock_status: 'in_stock', price: 100 }];
        if (sql.includes('LAST_INSERT_ID')) return [{ id: 42 }];
        return [];
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = { ...tx, $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
    const service = new PublicPortalService(prisma as any, { signAsync: jest.fn() } as any, { get: () => 4 } as any, {} as any);
    return { service, tx };
  }

  it('does not grant access to guest order history merely for knowing a phone number', async () => {
    const { service, tx } = setup();
    tx.$queryRawUnsafe.mockResolvedValue([{ id: 9, password: null, email: 'owner@example.com' }] as any);
    await expect(service.register({ fullName: 'Unknown Person', phone: '01012345678', password: 'secret123' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('issues registration credentials for the inserted identity even if another account shares the phone', async () => {
    const query = jest.fn(async (sql: string, id?: number) => {
      if (sql.includes('id,email,password')) return [];
      if (sql.includes('SELECT id FROM web_users WHERE phone')) return [{ id: 99 }];
      return [{ id, fullName: 'New Customer', phone: '01012345678', email: null }];
    });
    const service = new PublicPortalService({
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      web_users: { create: jest.fn().mockResolvedValue({ id: 42 }) },
    } as any, { signAsync: async () => 'token' } as any, { get: () => 4 } as any, {} as any);
    await expect(service.register({ fullName: 'New Customer', phone: '01012345678', password: 'secret123' })).resolves.toMatchObject({ user: { id: 42 } });
  });

  it('rejects malformed cart entries as a client error', async () => {
    const { service } = setup();
    await expect(service.createOrder({ ...checkout, items: [null] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized carts instead of silently dropping lines', async () => {
    const { service } = setup();
    await expect(service.createOrder({ ...checkout, items: Array.from({ length: 51 }, () => ({ productId: 1, quantity: 1 })) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes stock availability before decrementing stock in MySQL assignment order', async () => {
    const { service, tx } = setup();
    await expect(service.createOrder(checkout)).resolves.toMatchObject({ success: true, total: 200 });
    const update = tx.$executeRawUnsafe.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE products'));
    expect(update?.[0]).toMatch(/SET stock_status=IF\(current_stock-\?<=0,'out_of_stock','in_stock'\),current_stock=current_stock-\?/);
  });
});
