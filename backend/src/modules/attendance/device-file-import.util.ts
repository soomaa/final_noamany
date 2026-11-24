import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';

/** One punch read from the device's Excel export, ready to replay through the engine. */
export interface FilePunch {
  /** 1-based sheet row, so HR can find it in the file. */
  row: number;
  empCode: string;
  name: string;
  /** Wall-clock date of the punch, YYYY-MM-DD. */
  date: string;
  /** Wall-clock time of the punch, HH:mm:ss. */
  time: string;
  /** Which column it came from: actual in (6) or actual out (7). Informational only. */
  column: 'in' | 'out';
}

export interface FileRowProblem {
  row: number;
  empCode: string;
  name: string;
  message: string;
}

export interface ParsedDeviceFile {
  punches: FilePunch[];
  /** Rows that have an employee code but could not be read (bad date / time). */
  problems: FileRowProblem[];
  /** Rows with an employee and a date but no actual in/out time (absent days). */
  emptyRows: number;
}

/** A file this big is far beyond one month of a branch; refuse instead of timing out half-way. */
export const MAX_FILE_PUNCHES = 12_000;

const ARABIC_DIGITS = /[٠-٩]/g;
const toLatinDigits = (s: string) => s.replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const pad = (n: number) => String(n).padStart(2, '0');

type CellLike = { value: unknown; text?: string };

/** exceljs returns formula cells as { formula, result } and rich text as { richText: [...] }. */
function rawValue(cell: CellLike): unknown {
  const value = cell.value as unknown;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const v = value as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if ('result' in v) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join('');
    if (typeof v.text === 'string') return v.text;
  }
  return value;
}

function cellString(cell: CellLike): string {
  const value = rawValue(cell);
  if (value == null) return '';
  if (typeof value === 'string') return toLatinDigits(value).trim();
  const text = typeof cell.text === 'string' ? cell.text : String(value);
  return toLatinDigits(text).trim();
}

/** Strict calendar check (rejects 2026-02-30). */
function realDate(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** Date cell → YYYY-MM-DD. Accepts real Excel dates, serial numbers, d/m/Y (legacy) and Y-m-d. */
export function parseFileDate(cell: CellLike): string | null {
  const value = rawValue(cell);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // exceljs hands dates back as UTC midnight of the shown day.
    return realDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && value > 20_000 && value < 80_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return realDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const raw = cellString(cell).split(/\s+/)[0] ?? '';
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return realDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const ymd = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) return realDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  return null;
}

/**
 * Time cell → HH:mm:ss, `null` when empty, `'invalid'` when something is there but unreadable.
 * Accepts Excel time values, day fractions, "8:05", "08:05:30", "8:05 PM" and Arabic "٨:٠٥ م".
 */
export function parseFileTime(cell: CellLike): string | null | 'invalid' {
  const value = rawValue(cell);
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'invalid';
    return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'number') {
    if (value === 0) return null;
    if (value < 0 || value % 1 === 0) return 'invalid';
    const seconds = Math.round((value % 1) * 86_400) % 86_400;
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  }
  const text = cellString(cell)
    .replace(/\s*(ص|صباحا|صباحاً)\s*$/u, ' AM')
    .replace(/\s*(م|مساء|مساءً)\s*$/u, ' PM');
  if (!text || text === '-' || text === '--') return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return 'invalid';
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const period = match[4]?.toUpperCase();
  if (period) {
    if (hour < 1 || hour > 12) return 'invalid';
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59 || second > 59) return 'invalid';
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Reads the legacy fingerprint export (Hdoor_m::insert_hdoor column order):
 *   1 code, 2 name, 3 date, 4 shift in, 5 shift out, 6 actual in, 7 actual out,
 *   8 absent, 9 work hours, 10 department.
 * Only the actual in/out times (6, 7) are punches; the rest is the device's own summary.
 * An out time earlier than the in time is an overnight shift and belongs to the next day.
 */
export async function parseDeviceFile(buffer: Buffer): Promise<ParsedDeviceFile> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('تعذر قراءة الملف؛ تأكد أنه ملف Excel بصيغة XLSX');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.columnCount < 7) {
    throw new BadRequestException('ملف الحضور فارغ أو لا يحتوي أعمدة الحضور الفعلي والانصراف الفعلي');
  }

  const punches: FilePunch[] = [];
  const problems: FileRowProblem[] = [];
  let emptyRows = 0;
  sheet.eachRow((row, rowNumber) => {
    const empCode = cellString(row.getCell(1)).replace(/\.0+$/, '');
    // Headers, titles and blank lines carry no numeric code.
    if (!/^\d{1,9}$/.test(empCode) || Number(empCode) <= 0) return;
    const name = cellString(row.getCell(2));
    const problem = (message: string) => problems.push({ row: rowNumber, empCode, name, message });

    const date = parseFileDate(row.getCell(3));
    if (!date) return void problem('تاريخ غير مقروء في العمود الثالث');
    const timeIn = parseFileTime(row.getCell(6));
    const timeOut = parseFileTime(row.getCell(7));
    if (timeIn === 'invalid') problem('وقت الحضور الفعلي غير مقروء');
    if (timeOut === 'invalid') problem('وقت الانصراف الفعلي غير مقروء');
    const inTime = timeIn === 'invalid' ? null : timeIn;
    const outTime = timeOut === 'invalid' ? null : timeOut;
    if (!inTime && !outTime) {
      if (timeIn !== 'invalid' && timeOut !== 'invalid') emptyRows += 1;
      return;
    }
    if (inTime) punches.push({ row: rowNumber, empCode, name, date, time: inTime, column: 'in' });
    if (outTime) {
      const overnight = !!inTime && outTime < inTime;
      punches.push({ row: rowNumber, empCode, name, date: overnight ? nextDay(date) : date, time: outTime, column: 'out' });
    }
  });

  if (punches.length > MAX_FILE_PUNCHES) {
    throw new BadRequestException(`الملف يحتوي ${punches.length} بصمة؛ الحد ${MAX_FILE_PUNCHES} في المرة، قسّمه على فترات أقصر`);
  }
  if (!punches.length && !problems.length) {
    throw new BadRequestException('لم يتم العثور على بصمات حضور أو انصراف فعلية في الملف');
  }
  return { punches, problems, emptyRows };
}
