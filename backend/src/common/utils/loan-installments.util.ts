/** Mirrors Solaf_requests_model.php installment generation. */
export interface LoanInstallmentDraft {
  no: number;
  dueDate: string;
  amount: number;
  month: number;
  year: number;
  qstDate: string;
}

/** Legacy add_solfa repayment methods 1/2 always produce one installment. */
export function resolveLoanInstallmentCount(repaymentMethod: number, requested: number): number {
  return repaymentMethod === 3 ? requested : 1;
}

export function buildLoanInstallments(
  qemtSolaf: number,
  qstNum: number,
  khsmFormDateM: string,
): LoanInstallmentDraft[] {
  if (qstNum <= 0) return [];
  const base = new Date(khsmFormDateM);
  if (Number.isNaN(base.getTime())) return [];

  const qustValue = qemtSolaf / qstNum;
  const qustRemain = (qustValue - Math.round(qustValue)) * qstNum;
  const installments: LoanInstallmentDraft[] = [];
  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  for (let i = 0; i < qstNum; i++) {
    const due = new Date(base);
    due.setMonth(due.getMonth() + i);
    const dueDate = formatDate(due);
    const amount = i === qstNum - 1
      ? roundMoney(Math.round(qustValue) + qustRemain)
      : Math.round(qustValue);
    installments.push({
      no: i + 1,
      dueDate,
      amount,
      month: due.getMonth() + 1,
      year: due.getFullYear(),
      qstDate: String(Math.floor(due.getTime() / 1000)),
    });
  }
  return installments;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function khsmToDateM(khsmFormDateM: string, qstNum: number): string {
  const base = new Date(khsmFormDateM);
  if (Number.isNaN(base.getTime()) || qstNum <= 0) return khsmFormDateM;
  const end = new Date(base);
  end.setMonth(end.getMonth() + (qstNum - 1));
  return formatDate(end);
}
