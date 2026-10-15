export type PayrollStatus = 'draft' | 'computed' | 'reviewing' | 'approved' | 'posted' | 'bank_prepared' | 'banked' | 'completed';
export type PayrollAction = 'compute' | 'submit' | 'approve' | 'post' | 'bank' | 'bank-sync';
export interface PayrollRun {
  id: number;
  title: string;
  month: string;
  year: number;
  status: PayrollStatus;
  totalAmount: number;
  periodStart?: string;
  periodEnd?: string;
  payoutDate?: string;
  employeeCount?: number;
  createdAt?: string;
}
export interface PayrollLine {
  id: number;
  empCode?: string;
  employeeName?: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
}
export interface PayrollSlip {
  run: PayrollRun;
  employee: { id: number | null; empCode: number | null; name: string | null; jobTitle: string | null };
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  netSalary: number;
}
export interface PayrollActionResult extends PayrollRun {
  bankFile?: { filename: string; content: string };
}

export type MonthlyEventKind = 'deduction' | 'increase' | 'bonus' | 'evaluation' | 'target' | 'reversal';
export interface MonthlyEvent { id: number; kind: string; amount: number; note: string; actorName: string; createdAt: string; reversesId: number | null }
export interface MonthlyEmployee extends PayrollSlip {
  editable: boolean;
  adjustments?: Record<string, number>;
  history: MonthlyEvent[];
  cafe: { outstanding: number; selected: boolean; selectedAmount: number; settled: boolean; reservedElsewhere: number; invoiceCount: number };
}
export interface AddMonthlyEvent { kind: MonthlyEventKind; amount: number; note: string; requestId: string; reversesId?: number }
export interface MonthlyCafeChoice { deduct: boolean; expectedAmount: number; note: string; requestId: string }
