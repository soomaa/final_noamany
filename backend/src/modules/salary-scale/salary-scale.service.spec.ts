import { scaleSalaryForYears, yearsOfService } from './salary-scale.service';

describe('salary-scale apply math', () => {
  it('counts whole years of service from the hire date', () => {
    expect(yearsOfService('2023-08-01', '2026-08-24')).toBe(3);
    expect(yearsOfService('2026-08-24', '2026-08-24')).toBe(0);
    expect(yearsOfService(null, '2026-08-24')).toBe(0);
  });

  it('uses the matching x_N step, then falls back to salary_start', () => {
    const row = {
      salary_start: 4000,
      x_1: 4000,
      x_2: 4200,
      x_3: 4400,
      x_4: null,
      x_5: null,
      x_6: null,
      x_7: null,
      x_8: null,
      x_9: null,
      x_10: null,
      x_11: null,
      x_12: null,
      x_13: null,
      x_14: null,
      x_15: null,
    };
    expect(scaleSalaryForYears(row, 0)).toBe(4000);
    expect(scaleSalaryForYears(row, 2)).toBe(4400);
    expect(scaleSalaryForYears({ ...row, x_3: null }, 2)).toBe(4000);
  });
});
