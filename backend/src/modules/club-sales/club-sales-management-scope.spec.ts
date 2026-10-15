import { ForbiddenException } from '@nestjs/common';
import { ClubSalesDashboardService } from './club-sales-dashboard.service';
import { ClubSalesReportsService } from './club-sales-reports.service';

const salesUser = { sub: 9, emp_code: 77, branch: 1 } as never;

describe('sales management endpoints', () => {
  const employees = { isSalesEmployee: jest.fn().mockResolvedValue(true) };

  it('keeps team dashboards inaccessible to a personal sales specialist even with stale permissions', async () => {
    const service = new ClubSalesDashboardService(
      {} as never,
      {} as never,
      employees as never,
      {} as never,
    );

    await expect(service.overview({}, salesUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps team commission reports inaccessible to a personal sales specialist even with stale permissions', async () => {
    const service = new ClubSalesReportsService(
      {} as never,
      {} as never,
      employees as never,
      {} as never,
      {} as never,
    );

    await expect(service.salesRepsReport({}, salesUser)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
