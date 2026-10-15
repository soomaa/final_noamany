import { PayrollEngineService } from './payroll-engine.service';
import { cairoDateString, addDateOnlyDays } from '../../common/utils/cairo-date';

function setup() {
  const engine: any = new PayrollEngineService({ hr_emp_dwam: { findFirst: jest.fn().mockResolvedValue(null) } } as never, { get: jest.fn() } as never, {} as never);
  jest.spyOn(engine, 'resolveSalaryComponents').mockResolvedValue({ named: { housing: 0, transport: 0, communication: 0, meal: 0, nature: 0, assignment: 0, basicFallback: 0 }, otherAllowances: 100, recurringDeductions: 10 });
  for (const method of ['getZeyadaRateb','getHoursEdafi','getSheftEdafi','getGezaaByDate','getSolafByDate','getMokafaaByDate','getIncentives']) jest.spyOn(engine, method).mockResolvedValue(0);
  jest.spyOn(engine, 'getAttendanceOvertimeHours').mockResolvedValue({ hours: 0, dates: [], earlyLeaveMin: 0 });
  jest.spyOn(engine, 'getKeyabByDate').mockResolvedValue({ withoutSalaryDays: 0 });
  jest.spyOn(engine, 'getActualAbsence').mockResolvedValue({ count: 0, days: [] });
  jest.spyOn(engine, 'getLateByDate').mockResolvedValue({ lateWithoutPermission: 0, lateWithPermission: 0 });
  jest.spyOn(engine, 'getBankDetails').mockResolvedValue({});
  jest.spyOn(engine, 'computeInsurance').mockReturnValue({ empShare: 0, ownerShare: 0 });
  const calculate = (from: string, to: string, overrides = {}) => engine.computeOne({ id: 7, emp_code: 7, basic_salary: 3000 }, from, to, 3, 2026, {}, { id: 1, key: 'TEST@1', snapshot: {}, periodsPerYear: 12, annualAllowance: 0, annualTaxCredit: 0, brackets: [{ lowerBound: 0, upperBound: null, ratePercent: 10 }] }, overrides);
  return { engine, calculate };
}

describe('actual engine monthly adjustments', () => {
  it('includes bonuses/increases once in earnings and taxes, and café/manual amounts only in deductions', async () => {
    const { calculate } = setup();
    const row = await calculate('2026-03-01','2026-03-31',{ privateBonus: 200, manualIncrease: 50, manualDeduction: 100, cafeDeduction: 150 });
    expect(row.totalEsthkak).toBe(3350);
    expect(row.otherAllowances).toBe(350);
    expect(row.incomeTax).toBe(335);
    expect(row.otherDeductions).toBe(260);
    expect(row.totalKhsomat).toBe(595);
    expect(row.safi).toBe(2755);
  });
  it('does not classify the future or today’s unfinished shift as absence', async () => {
    const { calculate, engine } = setup();
    const today = cairoDateString();
    await calculate(today, addDateOnlyDays(today, 20));
    expect(engine.getActualAbsence).not.toHaveBeenCalled();
    await calculate(addDateOnlyDays(today,-10), addDateOnlyDays(today,20));
    expect(engine.getActualAbsence).toHaveBeenCalledWith(7,addDateOnlyDays(today,-10),addDateOnlyDays(today,-1));
  });
});
