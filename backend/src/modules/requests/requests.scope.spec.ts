import { ForbiddenException } from '@nestjs/common';
import { RequestsService } from './requests.service';

describe('RequestsService HR data scope', () => {
  const user = {
    sub: 7,
    employeeId: 17,
    employeeCode: 4401,
  } as never;

  function makeService() {
    const prisma = {
      hr_requests: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      hr_talabat_orders: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const scope = {
      requestWhere: jest.fn().mockResolvedValue({ emp_id_fk: { in: [17] } }),
      legacyRequestWhere: jest.fn().mockResolvedValue({ emp_id_fk: { in: [17] } }),
    };
    return {
      service: new RequestsService(
        prisma as never,
        scope as never,
        {} as never,
        {} as never,
      ),
      prisma,
    };
  }

  it('adds owner/organization predicates to both request sources', async () => {
    const { service, prisma } = makeService();

    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25 } as never, user);

    expect(prisma.hr_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ emp_id_fk: { in: [17] } }] },
      }),
    );
    expect(prisma.hr_talabat_orders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ emp_id_fk: { in: [17] } }] },
      }),
    );
  });

  it('does not reveal whether a foreign direct id exists', async () => {
    const { service } = makeService();

    await expect(service.findOne(99, user)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
