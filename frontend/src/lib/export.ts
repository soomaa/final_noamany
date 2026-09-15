export interface ExportColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  key: keyof T & string;
  header: string;
}

/** Download rows as Excel (.xlsx) — client-side, like SwatGym but typed. */
type ExcelCellValue = string | number | boolean | Date;

function toExcelCellValue(value: unknown): ExcelCellValue {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeSheetName(name: string, index: number, used: Set<string>): string {
  const base = name.replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const marker = ` (${suffix++})`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
  }
  used.add(candidate);
  return candidate;
}

async function createWorkbook() {
  // Loaded only when the user exports, keeping the reporting library out of the main bundle.
  const module = await import('exceljs');
  return new module.default.Workbook();
}

async function saveWorkbook(workbook: Awaited<ReturnType<typeof createWorkbook>>, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
  );
}

export async function downloadExcel<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = 'Sheet1',
) {
  const workbook = await createWorkbook();
  const worksheet = workbook.addWorksheet(safeSheetName(sheetName, 0, new Set()));
  worksheet.addRow(columns.map((column) => column.header));
  for (const row of rows) {
    worksheet.addRow(columns.map((column) => toExcelCellValue(row[column.key])));
  }
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns.forEach((column) => { column.width = 20; });
  await saveWorkbook(workbook, filename);
}

/** Download multiple sheets in one workbook. */
export async function downloadMultiSheetExcel(
  sheets: Array<{ name: string; columns: ExportColumn[]; rows: Record<string, unknown>[] }>,
  filename: string,
) {
  const workbook = await createWorkbook();
  const usedNames = new Set<string>();
  for (const [index, sheet] of sheets.entries()) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name, index, usedNames));
    worksheet.addRow(sheet.columns.map((column) => column.header));
    for (const row of sheet.rows) {
      worksheet.addRow(sheet.columns.map((column) => toExcelCellValue(row[column.key])));
    }
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns.forEach((column) => { column.width = 20; });
  }
  await saveWorkbook(workbook, filename);
}

/** Trigger browser download of a blob (server-generated export). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the object URL alive through the browser's download dispatch.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fetch server export endpoint and download. */
export async function downloadFromApi(apiUrl: string, filename: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl, { headers, credentials: 'include' });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  downloadBlob(blob, filename);
}

/** Open browser print dialog for a DOM element. */
export function printElement(element: HTMLElement, title?: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html dir="rtl"><head><title>${title ?? 'Print'}</title>
    <style>body{font-family:Tajawal,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f5f5f5}</style></head>
    <body>${element.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
