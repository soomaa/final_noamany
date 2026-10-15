import configuration from './configuration';

describe('portable configuration defaults', () => {
  it('never embeds host employee exemptions or branch topology', () => {
    const oldExempt = process.env.PAYROLL_DEDUCTION_EXEMPT_EMP_CODES;
    const oldFanout = process.env.DASHBOARD_BRANCH_FANOUT;
    delete process.env.PAYROLL_DEDUCTION_EXEMPT_EMP_CODES;
    delete process.env.DASHBOARD_BRANCH_FANOUT;
    try {
      const config = configuration();
      expect(config.payroll.deductionExemptEmpCodes).toEqual([]);
      expect(config.dashboard.branchFanout).toEqual({});
    } finally {
      if (oldExempt == null) delete process.env.PAYROLL_DEDUCTION_EXEMPT_EMP_CODES;
      else process.env.PAYROLL_DEDUCTION_EXEMPT_EMP_CODES = oldExempt;
      if (oldFanout == null) delete process.env.DASHBOARD_BRANCH_FANOUT;
      else process.env.DASHBOARD_BRANCH_FANOUT = oldFanout;
    }
  });
});
