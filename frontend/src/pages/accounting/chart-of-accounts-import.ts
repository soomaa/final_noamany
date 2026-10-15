import type { AccountLevel, AccountType } from '@/types/accounting';

/** One account row read out of an uploaded workbook, already normalised. */
export interface ParsedImportAccount {
  name: string;
  type: AccountType;
  accountLevel: AccountLevel;
  parentName: string;
  category: string;
  description: string;
  /** 1-based sheet row, so a rejected row can be pointed at. */
  rowNumber: number;
}

export interface ParsedImportResult {
  rows: ParsedImportAccount[];
  /** Rows that carried no usable account name and were skipped outright. */
  skipped: number;
}

/**
 * Header aliases, Arabic first. Matching is substring-based and case-insensitive so a
 * sheet exported from another system ("Account Name", "اسم الحساب الرئيسي") still lands.
 */
const HEADER_ALIASES = {
  name: ['اسم الحساب', 'الاسم', 'account name', 'name'],
  type: ['نوع الحساب', 'النوع', 'account type', 'type'],
  category: ['التصنيف', 'category'],
  level: ['المستوى', 'مستوى الحساب', 'level'],
  parent: ['الحساب الأب', 'الحساب الاب', 'parent account', 'parent'],
  description: ['الوصف', 'description', 'notes'],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;

function normalise(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    // ExcelJS hands back rich text and formula results as objects.
    const rich = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof rich.text === 'string') return rich.text.trim();
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join('').trim();
    if (rich.result != null) return String(rich.result).trim();
    return '';
  }
  return String(value).trim();
}

function matchHeader(header: string): HeaderKey | null {
  const h = header.toLowerCase();
  // Longest alias first, so "اسم الحساب" is not stolen by a bare "الاسم" match.
  const entries = (Object.keys(HEADER_ALIASES) as HeaderKey[]).flatMap((key) =>
    HEADER_ALIASES[key].map((alias) => ({ key, alias: alias.toLowerCase() })),
  );
  entries.sort((a, b) => b.alias.length - a.alias.length);
  for (const entry of entries) {
    if (h.includes(entry.alias)) return entry.key;
  }
  return null;
}

export function mapAccountType(raw: string): AccountType {
  const v = raw.toLowerCase();
  if (v.includes('خصوم') || v.includes('التزام') || v.includes('liab')) return 'liability';
  if (v.includes('ملكية') || v.includes('equity')) return 'equity';
  if (v.includes('إيراد') || v.includes('ايراد') || v.includes('revenue') || v.includes('income'))
    return 'revenue';
  if (v.includes('مصروف') || v.includes('expense')) return 'expense';
  return 'asset';
}

export function mapAccountLevel(raw: string, hasParent: boolean): AccountLevel {
  const v = raw.toLowerCase();
  // "حساب رئيسي فرعي" contains "رئيسي" too, so test the compound label first.
  if (v.includes('رئيسي فرعي') || v.includes('sub-main') || v.includes('submain'))
    return 'sub-main';
  if (v.includes('رئيسي') || v === 'main') return 'main';
  if (v.includes('فرعي') || v.includes('sub')) return 'sub';
  // No usable level column: a named parent implies a child, otherwise it is a root.
  return hasParent ? 'sub-main' : 'main';
}

/** Read the first worksheet of an .xlsx/.xls file into normalised account rows. */
export async function importAccountsWorkbook(file: File): Promise<ParsedImportResult> {
  // Loaded on demand so the spreadsheet library stays out of the main bundle.
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], skipped: 0 };

  const columns = new Map<HeaderKey, number>();
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const key = matchHeader(normalise(cell.value));
    if (key && !columns.has(key)) columns.set(key, colNumber);
  });
  // Without a name column there is nothing to import; fall back to the first column
  // so a bare single-column list still works.
  const nameCol = columns.get('name') ?? 1;

  const rows: ParsedImportAccount[] = [];
  let skipped = 0;
  const read = (rowNumber: number, key: HeaderKey): string => {
    const col = columns.get(key);
    if (!col) return '';
    return normalise(sheet.getRow(rowNumber).getCell(col).value);
  };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const name = normalise(sheet.getRow(rowNumber).getCell(nameCol).value);
    if (!name) {
      skipped++;
      continue;
    }
    const parentName = read(rowNumber, 'parent');
    rows.push({
      name,
      type: mapAccountType(read(rowNumber, 'type')),
      accountLevel: mapAccountLevel(read(rowNumber, 'level'), Boolean(parentName)),
      parentName,
      category: read(rowNumber, 'category'),
      description: read(rowNumber, 'description'),
      rowNumber,
    });
  }
  return { rows, skipped };
}
