import { isMarketingRepJobTitle, marketingRepEmployeeWhere } from './marketing-rep.util';

describe('sales-specialist job-title matching', () => {
  it.each(['sales', 'Sales Specialist', 'SALES REPRESENTATIVE'])('recognizes imported English title %s', (title) => {
    expect(isMarketingRepJobTitle(title)).toBe(true);
  });

  it.each(['سيلز', 'سيلز مان', 'اخصائي مبيعات', 'مسؤول مبيعات', 'مسئول مبيعات', 'مندوب مبيعات'])(
    'recognizes active Arabic title %s',
    (title) => expect(isMarketingRepJobTitle(title)).toBe(true),
  );

  it.each(['Sales Manager', 'مدير مبيعات', 'رئيس قسم المبيعات', 'مشرف مبيعات'])(
    'does not treat management title %s as a personal salesperson',
    (title) => expect(isMarketingRepJobTitle(title)).toBe(false),
  );

  it('does not use a broad contains query for the standalone سيلز title', () => {
    expect(marketingRepEmployeeWhere([]).OR).not.toContainEqual({
      mosma_wazefy_n: { contains: 'سيلز' },
    });
  });
});
