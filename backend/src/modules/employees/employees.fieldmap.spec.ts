import { formToData, rowToForm } from './employees.fieldmap';

describe('employee salary field mapping', () => {
  it('persists and reloads the basic salary in the employee record', () => {
    expect(formToData({ basic_salary: '7500.50' })).toEqual({ basic_salary: 7500.5 });
    expect(rowToForm({ basic_salary: 7500.5 }).basic_salary).toBe('7500.5');
  });
});

describe('employee fingerprint branch mapping', () => {
  it('persists the all-branches management option', () => {
    expect(formToData({ emp_sign: 'all' })).toEqual({ emp_sign: 'all' });
    expect(rowToForm({ emp_sign: 'all' }).emp_sign).toBe('all');
  });

  it('persists a single allowed fingerprint branch', () => {
    expect(formToData({ emp_sign: '3' })).toEqual({ emp_sign: '3' });
  });
});

describe('employee birth date compatibility', () => {
  it('prefills the visible date from the legacy column when the modern column is empty', () => {
    expect(rowToForm({ birth_date_m: null, birth_date: '1999-09-20' }).birth_date).toBe('1999-09-20');
  });

  it('keeps both date columns synchronized without an old hidden value winning', () => {
    expect(formToData({ birth_date: '2000-01-02', birthdate: '1999-09-20' })).toEqual({
      birth_date_m: '2000-01-02',
      birth_date: '2000-01-02',
    });
  });
});