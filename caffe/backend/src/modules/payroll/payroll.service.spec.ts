import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

describe('PayrollService salary controls', () => {
  it('blocks a payroll run while an active employee has no basic salary', async () => {
    const prisma = {
      employees: {
        findMany: jest.fn().mockResolvedValue([
          { id: 8, emp_code: 1008, employee: 'موظف بدون راتب', basic_salary: null },
        ]),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never);

    await expect(service.createRun({ month: 7, year: 2026 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
