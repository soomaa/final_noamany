import { DocumentsService } from './documents.service';

describe('DocumentsService data scope', () => {
  const user = { sub: 7, level: 3, branch: 2 } as any;
  const employeeScope = { branch_id_fk: { in: [2] } };

  function setup() {
    const prisma = {
      emp_files: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const scope = { employeeWhere: jest.fn().mockResolvedValue(employeeScope) } as any;
    return { prisma, scope, service: new DocumentsService(prisma, scope) };
  }

  it('pushes employee scope and pagination into the database query', async () => {
    const { prisma, scope, service } = setup();
    await service.list({ page: 2, pageSize: 20, skip: 20, take: 20 } as any, user);

    expect(scope.employeeWhere).toHaveBeenCalledWith(user, 'employees.documents');
    expect(prisma.emp_files.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([{ employee: employeeScope }]) }),
      skip: 20,
      take: 20,
    }));
    expect(prisma.emp_files.count).toHaveBeenCalled();
  });

  it('bounds expiring results and applies the same employee scope', async () => {
    const { prisma, service } = setup();
    await service.expiring(30, user);
    expect(prisma.emp_files.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([{ employee: employeeScope }]) }),
      take: 200,
    }));
  });
});
