import { BadRequestException } from '@nestjs/common';
import { AdministrativeDecisionsService } from './administrative-decisions.service';

describe('AdministrativeDecisionsService', () => {
  const prisma = {
    hr_edarat_aqsam: { findUnique: jest.fn() },
    employees: { findUnique: jest.fn() },
    all_defined_setting: { findUnique: jest.fn() },
    hr_ta3en_moaqt: { create: jest.fn() },
  };
  const service = new AdministrativeDecisionsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hr_edarat_aqsam.findUnique.mockResolvedValue({ id: 3, title: 'الموارد البشرية' });
    prisma.employees.findUnique.mockResolvedValue(null);
    prisma.all_defined_setting.findUnique.mockResolvedValue({
      defined_id: 7,
      defined_title: 'مهندس',
      defined_type: 4,
    });
    prisma.hr_ta3en_moaqt.create.mockImplementation(async ({ data }) => ({ id: 10, ...data }));
  });

  it('preserves the legacy total-salary formula and zero num_days value', async () => {
    const result = await service.create(
      {
        empName: 'موظف تجريبي',
        edaraId: 3,
        jobTitleId: 7,
        salary: 5000,
        housingAllowance: 1000,
        transportAllowance: 500,
        otherAllowance: 250,
        workDate: '2026-08-11',
        periodFrom: '2026-08-11',
        periodTo: '2026-11-11',
      },
      1,
      'مدير النظام',
    );

    expect(prisma.hr_ta3en_moaqt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total_salary: 6750, num_days: 0 }) }),
    );
    expect(result.totalSalary).toBe(6750);
  });

  it('rejects a probation period whose end precedes its start', async () => {
    await expect(
      service.create(
        {
          empName: 'موظف تجريبي',
          edaraId: 3,
          jobTitleId: 7,
          salary: 5000,
          housingAllowance: 0,
          transportAllowance: 0,
          otherAllowance: 0,
          workDate: '2026-08-11',
          periodFrom: '2026-11-11',
          periodTo: '2026-08-11',
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hr_ta3en_moaqt.create).not.toHaveBeenCalled();
  });
});
