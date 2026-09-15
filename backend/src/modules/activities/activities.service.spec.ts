import { ActivitiesService } from './activities.service';

describe('ActivitiesService', () => {
  it('lists activities when an employee has legacy enum values outside the selected fields', async () => {
    const employee = { employee: 'أحمد محمد' };
    const prisma = {
      hr_ansheta: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 41,
            emp_id: 7,
            title: 'اجتماع فريق',
            send_date: '2026-08-24',
            send_time: '10:30',
            suspend: 0,
            notes: null,
            rad_notes: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      employees: {
        findUnique: jest.fn().mockImplementation(({ select }) => {
          if (select?.employee === true && Object.keys(select).length === 1) {
            return Promise.resolve(employee);
          }
          return Promise.reject(new Error("Value '' not found in enum 'YesNo'"));
        }),
      },
      hr_ansheta_files: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ActivitiesService(prisma as never);

    await expect(service.list({ page: 1, pageSize: 20, order: 'desc', skip: 0, take: 20 })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 41,
          employeeName: 'أحمد محمد',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('opens an activity when an employee has legacy enum values outside the selected fields', async () => {
    const prisma = {
      hr_ansheta: {
        findUnique: jest.fn().mockResolvedValue({
          id: 41,
          emp_id: 7,
          title: 'اجتماع فريق',
          send_date: '2026-08-24',
          send_time: '10:30',
          suspend: 0,
          notes: null,
          rad_notes: null,
        }),
      },
      employees: {
        findUnique: jest.fn().mockImplementation(({ select }) => {
          if (select?.employee === true && Object.keys(select).length === 1) {
            return Promise.resolve({ employee: 'أحمد محمد' });
          }
          return Promise.reject(new Error("Value '' not found in enum 'YesNo'"));
        }),
      },
      hr_ansheta_files: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ActivitiesService(prisma as never);

    await expect(service.get(41)).resolves.toEqual(
      expect.objectContaining({ id: 41, employeeName: 'أحمد محمد' }),
    );
  });
});
