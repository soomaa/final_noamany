import { EmployeesService } from './employees.service';

describe('EmployeesService additional personal-sales assignment', () => {
  function serviceFor(employee: Record<string, unknown>) {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ name: 'موظف استقبال' }) },
    };
    return new EmployeesService(prisma as never, {} as never, {} as never);
  }

  it('treats a receptionist marked as sales as a personal sales employee', async () => {
    const service = serviceFor({
      mosma_wazefy_code: 12,
      mosma_wazefy_n: 'موظف استقبال',
      is_sales: true,
    });

    await expect(service.isSalesEmployee(41)).resolves.toBe(true);
  });

  it('does not treat an unmarked receptionist as a personal sales employee', async () => {
    const service = serviceFor({
      mosma_wazefy_code: 12,
      mosma_wazefy_n: 'موظف استقبال',
      is_sales: false,
    });

    await expect(service.isSalesEmployee(41)).resolves.toBe(false);
  });
});
