import { formToData, rowToForm } from './employees.fieldmap';

describe('employee salary field mapping', () => {
  it('persists and reloads the basic salary in the employee record', () => {
    expect(formToData({ basic_salary: '7500.50' })).toEqual({ basic_salary: 7500.5 });
    expect(rowToForm({ basic_salary: 7500.5 }).basic_salary).toBe('7500.5');
  });
});

describe('employee personal-sales field mapping', () => {
  it('persists the sales toggle as a boolean and reloads it for the edit form', () => {
    expect(formToData({ is_sales: true })).toEqual({ is_sales: true });
    expect(rowToForm({ is_sales: true }).is_sales).toBe(true);
    expect(rowToForm({ is_sales: false }).is_sales).toBe(false);
  });
});
