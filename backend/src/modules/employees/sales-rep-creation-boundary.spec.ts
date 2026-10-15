import { salesRepCreationBoundary } from './sales-rep-creation-boundary';

describe('sales representative creation boundary', () => {
  it('keeps employee identity creation in the standard employee workflow', () => {
    expect(salesRepCreationBoundary({ employeeId: null, jobTitle: 'أخصائي مبيعات' })).toEqual({
      canConfigureSales: false,
      reason: 'employee_required',
    });
    expect(salesRepCreationBoundary({ employeeId: 18, jobTitle: 'أخصائي مبيعات' })).toEqual({
      canConfigureSales: true,
      reason: null,
    });
    expect(salesRepCreationBoundary({ employeeId: 18, jobTitle: 'محاسب' }).canConfigureSales).toBe(false);
  });
});
