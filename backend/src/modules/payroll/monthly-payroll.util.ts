import { SalaryOverrides } from './payroll-engine.service';
export type PayrollWindow = { fromDate: string; toDate: string };
export function calendarPayrollPeriod(month: number, year: number): PayrollWindow {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return { fromDate: `${prefix}-01`, toDate: `${prefix}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
}
export function sumPayrollEvents(events: { id: number; kind: string; amount: unknown; reverses_id: number | null }[]): SalaryOverrides {
  const reversed = new Set(events.filter(e => e.kind === 'reversal').map(e => e.reverses_id));
  const result = { privateBonus: 0, taqeemValue: 0, targetValue: 0, manualIncrease: 0, manualDeduction: 0 };
  const keys = { bonus: 'privateBonus', evaluation: 'taqeemValue', target: 'targetValue', increase: 'manualIncrease', deduction: 'manualDeduction' } as const;
  for (const e of events) {
    const key = keys[e.kind as keyof typeof keys];
    if (key && !reversed.has(e.id)) result[key] = Math.round((result[key] + Number(e.amount)) * 100) / 100;
  }
  return result;
}
