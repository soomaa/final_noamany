import { downloadBlob } from './export';

/** Excel exports of «تقارير الاشتراكات» — Arabic, right-to-left, for the period chosen on the page. */

export interface TypeExportRow {
  subscriptionNumber: string;
  memberName: string;
  memberCode?: string | null;
  phone?: string | null;
  registrationDate: string;
  startDate: string;
  endDate: string;
  value: number;
  discount: number;
  collected: number;
  remaining: number;
  paymentMethod?: string | null;
  status?: string | null;
  branch?: string | null;
  sales?: string | null;
  createdBy?: string | null;
}

export interface TypeExportGroup {
  id: number | null;
  name: string;
  count: number;
  value: number;
  discount: number;
  collected: number;
  remaining: number;
  rows: TypeExportRow[];
}

export interface DetailExportRow {
  activity: string;
  memberName: string;
  memberCode?: string | null;
  phone?: string | null;
  reference: string;
  category: string;
  date: string;
  amount: number;
  collected: number;
  remaining?: number | null;
  userName?: string | null;
}

export interface ExportContext {
  gymName: string;
  startDate: string;
  endDate: string;
  /** Applied filters other than the period, already labelled (e.g. «الفرع: فرع بريدة»). */
  filters: string[];
  paymentLabel: (method: string | null | undefined) => string;
  formatDateTime: (iso: string) => string;
}

const STATUS_LABELS: Record<string, string> = { active: 'نشط', expired: 'منتهي', upcoming: 'لم يبدأ', frozen: 'مجمد' };
const MONEY = '#,##0.00';
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8F1F1' } };
const TOTAL_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4F4F4' } };
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };

type Workbook = import('exceljs').Workbook;
type Worksheet = import('exceljs').Worksheet;

async function newWorkbook(): Promise<Workbook> {
  const module = await import('exceljs');
  const workbook = new module.default.Workbook();
  workbook.creator = 'Noamany';
  workbook.created = new Date();
  return workbook;
}

export function excelSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'باقة';
  let candidate = base;
  for (let n = 2; used.has(candidate); n += 1) {
    const marker = ` (${n})`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
  }
  used.add(candidate);
  return candidate;
}

function addSheet(workbook: Workbook, name: string): Worksheet {
  return workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 0 }] });
}

/** Title block: sheet title, gym, period, filters. Returns the next free row number. */
function titleBlock(sheet: Worksheet, title: string, ctx: ExportContext, width: number): number {
  const lines = [title, ctx.gymName, `الفترة: من ${ctx.startDate} إلى ${ctx.endDate}`, ...ctx.filters];
  lines.forEach((text, index) => {
    const row = sheet.getRow(index + 1);
    row.getCell(1).value = text;
    sheet.mergeCells(index + 1, 1, index + 1, width);
    row.font = index === 0 ? { bold: true, size: 14 } : { size: 11, color: { argb: 'FF444444' } };
    row.alignment = { horizontal: 'right' };
  });
  return lines.length + 2;
}

function tableHeader(sheet: Worksheet, rowNumber: number, headers: string[]) {
  const row = sheet.getRow(rowNumber);
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}

function dataRow(sheet: Worksheet, rowNumber: number, values: Array<string | number | null | undefined>, moneyColumns: number[], total = false) {
  const row = sheet.getRow(rowNumber);
  values.forEach((value, index) => {
    const cell = row.getCell(index + 1);
    cell.value = value ?? '';
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    if (moneyColumns.includes(index + 1)) cell.numFmt = MONEY;
    if (total) { cell.font = { bold: true }; cell.fill = TOTAL_FILL; }
  });
}

function widths(sheet: Worksheet, values: number[]) {
  values.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

const sum = (rows: readonly object[], key: string) => rows.reduce<number>((total, row) => total + (Number((row as Record<string, unknown>)[key]) || 0), 0);

/** Summary sheet + one sheet per package with all of its subscriptions. */
export async function exportSubscriptionTypesWorkbook(types: TypeExportGroup[], ctx: ExportContext) {
  const workbook = await newWorkbook();
  const used = new Set<string>();

  const summary = addSheet(workbook, excelSheetName('الملخص', used));
  let r = titleBlock(summary, 'الأداء حسب نوع الاشتراك', ctx, 6);
  tableHeader(summary, r, ['الباقة', 'عدد الاشتراكات', 'قيمة العقود', 'الخصومات', 'المحصل', 'المتبقي']);
  for (const type of types) {
    r += 1;
    dataRow(summary, r, [type.name, type.count, type.value, type.discount, type.collected, type.remaining], [3, 4, 5, 6]);
  }
  r += 1;
  dataRow(summary, r, ['الإجمالي', sum(types, 'count'), sum(types, 'value'), sum(types, 'discount'), sum(types, 'collected'), sum(types, 'remaining')], [3, 4, 5, 6], true);
  widths(summary, [34, 16, 18, 16, 18, 16]);

  const headers = ['رقم الاشتراك', 'العضو', 'رقم العضو', 'رقم الموبايل', 'تاريخ التسجيل', 'تاريخ البداية', 'تاريخ النهاية', 'القيمة', 'الخصم', 'المحصل', 'المتبقي', 'طريقة الدفع', 'الحالة', 'الفرع', 'أخصائي المبيعات', 'مستخدم النظام'];
  for (const type of types) {
    const sheet = addSheet(workbook, excelSheetName(type.name, used));
    let row = titleBlock(sheet, type.name, ctx, headers.length);
    const facts: Array<[string, number, boolean]> = [
      ['عدد الاشتراكات', type.count, false], ['قيمة العقود', type.value, true], ['الخصومات', type.discount, true],
      ['المحصل', type.collected, true], ['المتبقي', type.remaining, true],
    ];
    for (const [label, value, money] of facts) {
      const line = sheet.getRow(row);
      line.getCell(1).value = label;
      line.getCell(1).font = { bold: true };
      line.getCell(2).value = value;
      if (money) line.getCell(2).numFmt = MONEY;
      row += 1;
    }
    row += 1;
    tableHeader(sheet, row, headers);
    sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: row }];
    for (const item of type.rows) {
      row += 1;
      dataRow(sheet, row, [
        item.subscriptionNumber, item.memberName, item.memberCode ?? '', item.phone ?? '', item.registrationDate, item.startDate, item.endDate,
        item.value, item.discount, item.collected, item.remaining, ctx.paymentLabel(item.paymentMethod),
        STATUS_LABELS[item.status ?? ''] ?? item.status ?? '', item.branch ?? '', item.sales ?? '', item.createdBy ?? '',
      ], [8, 9, 10, 11]);
    }
    row += 1;
    dataRow(sheet, row, ['الإجمالي', '', '', '', '', '', '', sum(type.rows, 'value'), sum(type.rows, 'discount'), sum(type.rows, 'collected'), sum(type.rows, 'remaining'), '', '', '', '', ''], [8, 9, 10, 11], true);
    widths(sheet, [16, 28, 12, 15, 14, 14, 14, 14, 12, 14, 12, 22, 10, 16, 20, 18]);
  }

  await save(workbook, `subscription-types-${ctx.startDate}-${ctx.endDate}.xlsx`);
}

/** The open operations table of one card, all pages. */
export async function exportDetailWorkbook(title: string, rows: DetailExportRow[], ctx: ExportContext) {
  const workbook = await newWorkbook();
  const sheet = addSheet(workbook, excelSheetName(title, new Set()));
  const headers = ['العملية', 'العضو', 'رقم العضو', 'رقم الموبايل', 'المرجع', 'التصنيف', 'التاريخ والوقت', 'القيمة', 'المحصل', 'المتبقي', 'مستخدم النظام'];
  let row = titleBlock(sheet, title, ctx, headers.length);
  tableHeader(sheet, row, headers);
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: row }];
  for (const item of rows) {
    row += 1;
    dataRow(sheet, row, [item.activity, item.memberName, item.memberCode ?? '', item.phone ?? '', item.reference, item.category, ctx.formatDateTime(item.date), item.amount, item.collected, item.remaining ?? '', item.userName ?? ''], [8, 9, 10]);
  }
  row += 1;
  dataRow(sheet, row, ['الإجمالي', `${rows.length} عملية`, '', '', '', '', '', sum(rows, 'amount'), sum(rows, 'collected'), sum(rows, 'remaining'), ''], [8, 9, 10], true);
  widths(sheet, [14, 28, 12, 15, 16, 26, 20, 14, 14, 12, 18]);
  await save(workbook, `${title.replace(/[\\/:*?"<>|]/g, ' ').trim()}-${ctx.startDate}-${ctx.endDate}.xlsx`);
}

async function save(workbook: Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
