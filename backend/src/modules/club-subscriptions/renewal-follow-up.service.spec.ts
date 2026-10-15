import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { RenewalFollowUpService } from './renewal-follow-up.service';
import { CreateSubscriptionFollowUpDto, RenewalFollowUpQuery } from './dto/renewal-follow-up.dto';
const user = { sub: 7, level: 2, branch: 1, name: 'Reception' } as JwtUser;
const source = { id: 1, member_id: 10, branch_id: 1, member: { id: 10, is_deleted: false } };
function setup() {
  const prisma = {
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([]) },
    club_attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    club_subscription_follow_ups: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 1, ...data })) },
  };
  const service = new RenewalFollowUpService(prisma as any, new BranchScopeService({ get: () => ({}) } as unknown as ConfigService));
  return { prisma, service };
}
it('rejects cross-branch history and writes before querying history or persisting', async () => {
  const { service, prisma } = setup();
  prisma.club_subscriptions.findUnique.mockResolvedValue({ ...source, branch_id: 2 });
  await expect(service.history(1, user)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(service.contact(1, { status: 'contacted' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
  expect(prisma.club_subscription_follow_ups.create).not.toHaveBeenCalled();
});
it('rejects archived members and preserves staff identity on contact records', async () => {
  const { service, prisma } = setup();
  const result = await service.contact(1, { status: 'promised', note: '  Monday  ', nextContactOn: '2026-09-14' }, user);
  expect(result).toMatchObject({ subscription_id: 1, status: 'promised', note: 'Monday', created_by: 7, created_by_name: 'Reception', next_contact_on: '2026-09-14' });
  prisma.club_subscriptions.findUnique.mockResolvedValue({ ...source, member: { id: 10, is_deleted: true } });
  await expect(service.history(1, user)).rejects.toBeInstanceOf(NotFoundException);
});
it('scopes subscriptions and attendance, intersecting an out-of-scope branch request', async () => {
  const { service, prisma } = setup();
  const result = await service.list(Object.assign(new RenewalFollowUpQuery(), { branch: '2' }), user);
  expect(result.total).toBe(0);
  expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([{ branch_id: { in: [1] } }, { branch_id: 2 }]));
  // Attendance must fail closed as well; cannot overwrite scope with requested branch.
  const where = prisma.club_attendance.groupBy.mock.calls[0][0].where;
  expect(where.AND).toEqual(expect.arrayContaining([{ branch_id: { in: [1] } }, { branch_id: 2 }]));
});
it('validates contact statuses, calendar dates, note lengths and thresholds', async () => {
  for (const body of [{ status: 'invalid' }, { status: 'promised', nextContactOn: '2026-02-31' }, { status: 'contacted', note: 'x'.repeat(2001) }]) {
    expect((await validate(plainToInstance(CreateSubscriptionFollowUpDto, body))).length).toBeGreaterThan(0);
  }
  expect(await validate(plainToInstance(CreateSubscriptionFollowUpDto, { status: 'promised', nextContactOn: '2026-09-14' }))).toEqual([]);
  expect((await validate(plainToInstance(RenewalFollowUpQuery, { absenceDays: 0 }))).length).toBeGreaterThan(0);
});
it('classifies complete histories before searching or paginating', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-12T12:00:00Z'));
  try {
    const { service, prisma } = setup();
    const row = (id: number, extra: Record<string, unknown> = {}) => ({
      id, member_id: id, branch_id: 1, subscription_number: `S${id}`, member: { id, name: `Member ${id}`, member_code: `M${id}`, phone: '01000000000' },
      subscription_type_id: 1, subscription_type: 'Gym', subscription_start_date: '2026-08-01', subscription_end_date: '2026-08-31', registration_date: '2026-08-01', status: 'expired',
      is_linked_to_sessions: false, sessions_count: null, sessions_used: 0, renewal_successor: null, plan_transfers_out: [], member_transfer_source: null, freezes: [], follow_ups: [], ...extra,
    });
    prisma.club_subscriptions.findMany.mockResolvedValue([
      ...Array.from({ length: 35 }, (_, i) => row(i + 1, i === 1 ? { subscription_type_id: null, private_package_id: 5 } : i === 2 ? { subscription_type_id: null, special_class_type_id: 8 } : {})),
      row(40, { member_id: 1, subscription_start_date: '2026-09-01', subscription_end_date: '2026-09-30' }),
    ]);
    const first = await service.list(Object.assign(new RenewalFollowUpQuery(), { page: 2, pageSize: 5, search: '0100' }), user);
    expect(first.total).toBe(34);
    const sameDay = await service.list(Object.assign(new RenewalFollowUpQuery(), { expiryFrom: '2026-08-31', expiryTo: '2026-08-31' }), user);
    expect(sameDay.total).toBe(34);
    const outside = await service.list(Object.assign(new RenewalFollowUpQuery(), { expiryFrom: '2026-09-01', expiryTo: '2026-09-12' }), user);
    expect(outside.total).toBe(0);
    const all = await service.list(Object.assign(new RenewalFollowUpQuery(), { pageSize: 100 }), user);
    expect(all.data.filter(r => [2, 3].includes(r.id)).map(r => r.canRenew)).toEqual([true, true]);
    expect(first.data.map(r => r.id)).toEqual([30, 29, 28, 27, 26]);
    const oldPeriodSearch = await service.list(Object.assign(new RenewalFollowUpQuery(), { search: 'S1' }), user);
    expect(oldPeriodSearch.data.map(r => r.id)).not.toContain(1);
  } finally { jest.useRealTimers(); }
});
it('rejects a reversed expiry range before reading the database', async () => {
  const { service, prisma } = setup();
  await expect(service.list(Object.assign(new RenewalFollowUpQuery(), { expiryFrom: '2026-09-01', expiryTo: '2026-08-01' }), user)).rejects.toThrow('تاريخ البداية');
  expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
  expect((await validate(plainToInstance(RenewalFollowUpQuery, { expiryFrom: '2026-02-31' }))).length).toBeGreaterThan(0);
});
