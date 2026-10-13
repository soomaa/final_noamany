import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubWellnessService } from './club-wellness.service';
import { localDateString } from './club-fitness.utils';

const receptionist = { sub: 10, level: 2, branch: 3, job_title: 'موظف استقبال', man_women_type: 1 } as never;
const query = { page: 1, pageSize: 20, skip: 0, take: 20 } as never;
function setup() {
  const rows = [{ id: 1, member_id: 42, measurement_date: localDateString(), report_url: '/uploads/test.pdf' }];
  const prisma = {
    club_members: { findMany: jest.fn().mockResolvedValue([{ id: 42, name: 'عضو قديم', member_code: 'B868', gender: 'male' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 42 }), findUnique: jest.fn().mockResolvedValue({ id: 42 }) },
    club_inbody_measurements: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(rows[0]), findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(rows[0]), update: jest.fn(), delete: jest.fn() },
  };
  const service = new ClubWellnessService(prisma as never, {} as never, { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) }, new BranchScopeService());
  return { service, prisma };
}
describe('reception member measurements', () => {
  it('limits both rows and totals to today, active group members and the permitted section', async () => {
    const { service, prisma } = setup();
    await service.listInbodyMeasurements({ ...query as object, dateFrom: '2000-01-01', dateTo: '2099-12-31' } as never, receptionist);
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_deleted: false, branch_id: { in: [3, 7] }, gender: 'male' } }));
    const where = { measurement_date: localDateString(), member_id: { in: [42] } };
    expect(prisma.club_inbody_measurements.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.club_inbody_measurements.count).toHaveBeenCalledWith({ where });
  });
  it('preserves historical date filters for administrators', async () => {
    const { service, prisma } = setup();
    await service.listInbodyMeasurements({ ...query as object, dateFrom: '2020-01-01', dateTo: '2020-01-31' } as never, { sub: 1, level: 1 } as never);
    expect(prisma.club_inbody_measurements.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ measurement_date: { gte: '2020-01-01', lte: '2020-01-31' } }) }));
  });
  it('rejects reading or deleting an older measurement directly', async () => {
    const { service, prisma } = setup();
    prisma.club_inbody_measurements.findUnique.mockResolvedValue({ id: 1, member_id: 42, measurement_date: '2000-01-01', report_url: '/uploads/old.pdf' });
    await expect(service.findInbodyMeasurement(1, receptionist)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeInbodyMeasurement(1, receptionist)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_inbody_measurements.delete).not.toHaveBeenCalled();
  });
  it('allows a new measurement today for an older grouped member', async () => {
    const { service, prisma } = setup();
    await expect(service.createInbodyMeasurement({ memberId: 42, measurementDate: localDateString(), reportUrl: '/uploads/test.pdf' }, receptionist)).resolves.toMatchObject({ memberId: 42 });
    expect(prisma.club_members.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ id: 42 }, { is_deleted: false, branch_id: { in: [3, 7] }, gender: 'male' }] } }));
    expect(prisma.club_inbody_measurements.create).toHaveBeenCalled();
  });
  it('blocks adding a measurement for a member outside the allowed group or section', async () => {
    const { service, prisma } = setup();
    prisma.club_members.findFirst.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null as never);
    await expect(service.createInbodyMeasurement({ memberId: 99, measurementDate: localDateString() }, receptionist)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_inbody_measurements.create).not.toHaveBeenCalled();
  });

  it('rejects backdating a new measurement through a direct request', async () => {
    const { service, prisma } = setup();
    await expect(service.createInbodyMeasurement({ memberId: 42, measurementDate: '2000-01-01' }, receptionist)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_inbody_measurements.create).not.toHaveBeenCalled();
  });

  it('keeps a member and text search from expanding the measurement audience', async () => {
    const { service, prisma } = setup();
    prisma.club_members.findMany.mockResolvedValueOnce([{ id: 42 }] as never).mockResolvedValueOnce([{ id: 99 }] as never);
    await service.listInbodyMeasurements({ ...query as object, memberId: '42', search: 'عضو' } as never, receptionist);
    expect(prisma.club_inbody_measurements.count).toHaveBeenCalledWith({ where: { member_id: { in: [] }, measurement_date: localDateString() } });
  });
});
