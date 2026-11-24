import { downloadBlob } from './export';
import { excelSheetName } from './subscription-report-excel';

/**
 * «تقارير الاشتراكات» → «نظرة عامة» → «تصدير Excel»: the subscriptions registered in the period,
 * one column per payment method of the gym, with the totals block at the top of the sheet.
 */

export interface PeriodExportRow {
  memberCode: string | null;
  memberName: string | null;
  phone: string | null;
  subscriptionType: string | null;
  subscriptionNumber: string;
  registrationDate: string;
  createdAt: string;
  value: number;
  discount: number;
  paid: number;
  byMethod: Record<string, number>;
}

export interface PeriodExportOther {
  receiptNumber: string;
  date: string;
  createdAt: string;
  memberCode: string | null;
  memberName: string | null;
  phone: string | null;
  description: string | null;
  amount: number;
  byMethod: Record<string, number>;
}

export interface PeriodExport {
  startDate: string;
  endDate: string;
  methods: string[];
  rows: PeriodExportRow[];
  other: PeriodExportOther[];
}

type Worksheet = import('exceljs').Worksheet;
type Cell = import('exceljs').Cell;

const MONEY = '#,##0.00';
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };

const round2 = (value: number) => Math.round(value * 100) / 100;
const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));

/** «2026-11-07 07:13 PM»; the time is shown only when the entry was made on the registration day. */
export function registrationStamp(registrationDate: string, createdAt: string): string {
  const day = registrationDate.slice(0, 10);
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return day;
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDay = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  if (localDay !== day) return day;
  const hours = at.getHours() % 12 || 12;
  return `${day} ${pad(hours)}:${pad(at.getMinutes())} ${at.getHours() < 12 ? 'AM' : 'PM'}`;
}

function styleRow(sheet: Worksheet, at: number, width: number, apply: (cell: Cell, column: number) => void) {
  const row = sheet.getRow(at);
  for (let column = 1; column <= width; column += 1) {
    const cell = row.getCell(column);
    cell.border = BOX;
    apply(cell, column);
  }
}

function headerRow(sheet: Worksheet, at: number, labels: string[]) {
  const row = sheet.getRow(at);
  labels.forEach((label, index) => { row.getCell(index + 1).value = label; });
  styleRow(sheet, at, labels.length, (cell) => {
    cell.font = { bold: true };
    cell.fill = fill('FFE8F1F1');
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 24;
}

function titleRows(sheet: Worksheet, lines: string[], width: number) {
  lines.forEach((text, index) => {
    const row = sheet.getRow(index + 1);
    row.getCell(1).value = text;
    sheet.mergeCells(index + 1, 1, index + 1, width);
    row.font = index === 0 ? { bold: true, size: 14 } : { size: 11, color: { argb: 'FF444444' } };
    row.alignment = { horizontal: 'right' };
  });
  return lines.length + 2;
}

/** A label spanning the descriptive columns and one amount spanning the money columns. */
function labelledTotal(sheet: Worksheet, at: number, label: string, amount: number, width: number, labelWidth: number, highlight = false) {
  const row = sheet.getRow(at);
  row.getCell(1).value = label;
  row.getCell(labelWidth + 1).value = amount;
  sheet.mergeCells(at, 1, at, labelWidth);
  sheet.mergeCells(at, labelWidth + 1, at, width);
  const color = highlight ? 'FFC00000' : 'FF000000';
  styleRow(sheet, at, width, (cell, column) => {
    cell.font = { bold: true, size: highlight ? 13 : 11, color: { argb: color } };
    cell.fill = fill(highlight ? 'FFFCE4E4' : 'FFF4F4F4');
    cell.alignment = { horizontal: column <= labelWidth ? 'right' : 'center', vertical: 'middle' };
    if (column > labelWidth) cell.numFmt = MONEY;
  });
  row.height = highlight ? 24 : 20;
}

export async function exportPeriodWorkbook(data: PeriodExport, context: { gymName: string; branch: string }) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Noamany';
  const used = new Set<string>();
  const heading = [`${context.gymName} · ${context.branch}`, `الفترة: من ${data.startDate} إلى ${data.endDate}`];

  const fixed = ['#', 'كود العضو', 'إسم العضو', 'رقم الموبايل', 'نوع الاشتراك', 'تاريخ التسجيل', 'قيمة الاشتراك', 'الخصم', 'المدفوع'];
  const headers = [...fixed, ...data.methods];
  const width = headers.length;
  const labelWidth = 6; // # … تاريخ التسجيل
  const methodTotal = (rows: Array<{ byMethod: Record<string, number> }>, method: string) => sum(rows.map((row) => row.byMethod[method] ?? 0));
  const paymentsTotal = sum(data.methods.map((method) => methodTotal(data.rows, method)));
  const otherTotal = sum(data.other.map((row) => row.amount));

  const sheet = workbook.addWorksheet(excelSheetName('الاشتراكات', used), { views: [{ rightToLeft: true }] });
  let r = titleRows(sheet, ['تقرير الاشتراكات', ...heading], width);

  // Totals first, so the summary is visible before the details.
  headerRow(sheet, r, headers);
  r += 1;
  const totals = sheet.getRow(r);
  totals.getCell(1).value = `المجموع (${data.rows.length} اشتراك)`;
  sheet.mergeCells(r, 1, r, labelWidth);
  totals.getCell(7).value = sum(data.rows.map((row) => row.value));
  totals.getCell(8).value = sum(data.rows.map((row) => row.discount));
  totals.getCell(9).value = sum(data.rows.map((row) => row.paid));
  data.methods.forEach((method, index) => { totals.getCell(fixed.length + index + 1).value = methodTotal(data.rows, method); });
  styleRow(sheet, r, width, (cell, column) => {
    cell.font = { bold: true };
    cell.fill = fill('FFF4F4F4');
    cell.alignment = { horizontal: column <= labelWidth ? 'right' : 'center', vertical: 'middle' };
    if (column > labelWidth) cell.numFmt = MONEY;
  });
  totals.height = 22;
  r += 1; labelledTotal(sheet, r, 'الإجمالي', paymentsTotal, width, labelWidth);
  r += 1; labelledTotal(sheet, r, 'إيرادات أخرى', otherTotal, width, labelWidth);
  r += 1; labelledTotal(sheet, r, 'الإجمالي', round2(paymentsTotal + otherTotal), width, labelWidth, true);

  // Then the subscriptions themselves.
  r += 3;
  headerRow(sheet, r, headers);
  data.rows.forEach((item, index) => {
    r += 1;
    const row = sheet.getRow(r);
    const values: Array<string | number | null> = [
      index + 1, item.memberCode, item.memberName, item.phone, item.subscriptionType,
      registrationStamp(item.registrationDate, item.createdAt), item.value, item.discount, item.paid,
      ...data.methods.map((method) => item.byMethod[method] || null),
    ];
    values.forEach((value, column) => { row.getCell(column + 1).value = value ?? ''; });
    styleRow(sheet, r, width, (cell, column) => {
      if (column > labelWidth) cell.numFmt = MONEY;
      cell.alignment = { horizontal: column === 3 || column === 5 ? 'right' : 'center', vertical: 'middle' };
    });
  });
  sheet.columns = [
    { width: 6 }, { width: 12 }, { width: 28 }, { width: 15 }, { width: 30 }, { width: 20 }, { width: 14 }, { width: 11 }, { width: 13 },
    ...data.methods.map(() => ({ width: 13 })),
  ];

  // «إيرادات أخرى»: what makes up that line, split by the same payment methods.
  if (data.other.length) {
    const otherHeaders = ['#', 'رقم الإيصال', 'التاريخ', 'كود العضو', 'إسم العضو', 'رقم الموبايل', 'البيان', 'المبلغ', ...data.methods];
    const other = workbook.addWorksheet(excelSheetName('إيرادات أخرى', used), { views: [{ rightToLeft: true }] });
    let o = titleRows(other, ['إيرادات أخرى', ...heading], otherHeaders.length);
    headerRow(other, o, otherHeaders);
    o += 1;
    const head = other.getRow(o);
    head.getCell(1).value = `المجموع (${data.other.length} إيصال)`;
    other.mergeCells(o, 1, o, 7);
    head.getCell(8).value = otherTotal;
    data.methods.forEach((method, index) => { head.getCell(9 + index).value = methodTotal(data.other, method); });
    styleRow(other, o, otherHeaders.length, (cell, column) => {
      cell.font = { bold: true, color: { argb: column > 7 ? 'FFC00000' : 'FF000000' } };
      cell.fill = fill('FFF4F4F4');
      cell.alignment = { horizontal: column <= 7 ? 'right' : 'center', vertical: 'middle' };
      if (column > 7) cell.numFmt = MONEY;
    });
    o += 2;
    headerRow(other, o, otherHeaders);
    data.other.forEach((item, index) => {
      o += 1;
      const row = other.getRow(o);
      const values: Array<string | number | null> = [
        index + 1, item.receiptNumber, registrationStamp(item.date, item.createdAt), item.memberCode, item.memberName, item.phone, item.description, item.amount,
        ...data.methods.map((method) => item.byMethod[method] || null),
      ];
      values.forEach((value, column) => { row.getCell(column + 1).value = value ?? ''; });
      styleRow(other, o, otherHeaders.length, (cell, column) => {
        if (column > 7) cell.numFmt = MONEY;
        cell.alignment = { horizontal: column === 5 || column === 7 ? 'right' : 'center', vertical: 'middle', wrapText: column === 7 };
      });
    });
    other.columns = [{ width: 6 }, { width: 16 }, { width: 20 }, { width: 12 }, { width: 28 }, { width: 15 }, { width: 34 }, { width: 13 }, ...data.methods.map(() => ({ width: 13 }))];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `تقرير-الاشتراكات-${data.startDate}-إلى-${data.endDate}.xlsx`,
  );
}
