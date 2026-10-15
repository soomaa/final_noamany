import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';

describe('private renewal purchased quantity', () => {
  const source = { branch_id: 2, private_package_id: 7, private_trainer_id: 9, sessions_count: 4 };
  const client: any = {
    club_private_packages: { findUnique: jest.fn() },
    club_trainers: { findFirst: jest.fn() },
  };
  const service: any = Object.create(ClubSubscriptionRenewalService.prototype);
  beforeEach(() => {
    client.club_private_packages.findUnique.mockResolvedValue({ id: 7, name: 'PT', is_active: true, price: 1200, sessions_count: 12, duration_days: 30, branches: [{ branch_id: 2 }], session_prices: [{ sessions_count: 4, price: 450 }] });
    client.club_trainers.findFirst.mockResolvedValue({ id: 9 });
  });
  it('renews the purchased four sessions using their current price tier', async () => {
    const result = await service.resolvePrivatePackage(source, client);
    expect(result).toMatchObject({ sessionsCount: 4, grossValue: 450, privateTrainerId: 9 });
    expect(result.endDate('2026-10-01')).toBe('2026-10-30');
  });
  it('requires replacing an unavailable trainer before taking renewal payment', async () => {
    client.club_trainers.findFirst.mockResolvedValue(null);
    await expect(service.resolvePrivatePackage(source, client)).rejects.toThrow('الكابتن');
    expect(client.club_trainers.findFirst).toHaveBeenCalledWith({ where: { id: 9, is_active: true, is_deleted: false } });
  });
  it('refuses an old quantity above the new package maximum', async () => {
    await expect(service.resolvePrivatePackage({ ...source, sessions_count: 15 }, client)).rejects.toThrow('عدد الحصص');
  });
});
