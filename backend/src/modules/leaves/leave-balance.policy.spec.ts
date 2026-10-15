import { BadRequestException } from '@nestjs/common';
import { accruedAnnualLeave, inclusiveLeaveDays } from './leave-balance.policy';

describe('leave balance policy', () => {
  it('derives inclusive days from dates and never trusts a client total', () => {
    expect(inclusiveLeaveDays('2026-08-01', '2026-08-01')).toBe(1);
    expect(inclusiveLeaveDays('2026-08-01', '2026-08-05')).toBe(5);
    expect(() => inclusiveLeaveDays('2026-02-30', '2026-03-01')).toThrow(BadRequestException);
  });

  it('caps monthly accrual to the target year and adds carry-over once', () => {
    expect(accruedAnnualLeave({
      annualQuota: 24,
      previousBalance: 3,
      accrualStartDate: '2020-01-01',
      asOfDate: '2026-08-26',
    })).toBe(17);
    expect(accruedAnnualLeave({
      annualQuota: 24,
      previousBalance: 3,
      accrualStartDate: '2026-07-15',
      asOfDate: '2026-08-14',
    })).toBe(3);
  });
});
