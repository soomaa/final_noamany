import { formToData, rowToForm } from './employees.fieldmap';

describe('employee salary field mapping', () => {
  it('persists and reloads the basic salary in the employee record', () => {
    expect(formToData({ basic_salary: '7500.50' })).toEqual({ basic_salary: 7500.5 });
    expect(rowToForm({ basic_salary: 7500.5 }).basic_salary).toBe('7500.5');
  });
});
