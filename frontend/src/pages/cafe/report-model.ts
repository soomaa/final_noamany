import { toCsvWithBom } from '../../lib/csv.ts';

export function cafeReportCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  return toCsvWithBom(rows);
}

type CafeSectionMetric = {
  quantity: number;
  billed: number;
  collected: number;
  cost: number;
  profit: number;
};

type ManagementWithdrawal = {
  reference: string;
  date: string | Date;
  status: string;
  amount: number;
  reason?: string | null;
  items: Array<{ name: string; quantity: number; cost: number }>;
};

type CafeReportSections = {
  protein: CafeSectionMetric;
  bar: CafeSectionMetric;
  managementWithdrawals: ManagementWithdrawal[];
};

export function buildCafeReportExportRows(
  section: 'summary' | 'protein' | 'bar' | 'management_withdrawals',
  report: CafeReportSections,
): unknown[][] {
  if (section === 'management_withdrawals') {
    return [
      ['المرجع', 'التاريخ', 'الحالة', 'التكلفة المعتمدة', 'السبب', 'الأصناف'],
      ...report.managementWithdrawals.map((row) => [
        row.reference,
        String(row.date).slice(0, 10),
        row.status,
        row.amount,
        row.reason ?? '',
        row.items.map((item) => `${item.name} × ${item.quantity}`).join(' | '),
      ]),
    ];
  }

  const header = ['القسم', 'الكمية', 'قيمة الفواتير', 'المحصل فعليًا', 'التكلفة', 'الربح'];
  const metricRow = (label: string, row: CafeSectionMetric) =>
    [label, row.quantity, row.billed, row.collected, row.cost, row.profit];
  return [
    header,
    ...(section === 'summary' || section === 'protein' ? [metricRow('Protein', report.protein)] : []),
    ...(section === 'summary' || section === 'bar' ? [metricRow('Bar', report.bar)] : []),
  ];
}
