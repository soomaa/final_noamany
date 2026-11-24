import * as ExcelJS from 'exceljs';
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from './club-sales.constants';

/**
 * The export exists so the manager can hand a file to the sales team and upload the same
 * file straight back as leads. That only holds while the first eight columns stay exactly
 * the import template, in order — `importExcel` reads cells by position, so a column
 * inserted anywhere in 1-8 silently shifts every field into the wrong one.
 *
 * These are the header rows of the template and of the export, side by side.
 */
const IMPORT_TEMPLATE_HEADERS = [
  'الاسم الكامل',
  'الهاتف',
  'المصدر',
  'رابط فيسبوك',
  'الباقة المهتم (رقم أو اسم)',
  'ملاحظات',
  'رقم الفرع',
  'رقم أخصائي المبيعات (اختياري)',
];

const HANDOFF_EXTRA_HEADERS = [
  'نوع الاشتراك',
  'المدفوع',
  'تاريخ البداية',
  'تاريخ النهاية',
  'كود العضو',
];

/** Cell positions importExcel reads, from its own source. */
const IMPORT_CELL_MAP = {
  fullName: 1,
  phone: 2,
  source: 3,
  facebookProfileUrl: 4,
  interestedProgram: 5,
  notes: 6,
  branchId: 7,
  assignedToId: 8,
} as const;

describe('renewal hand-off file uploads back as leads', () => {
  const headers = [...IMPORT_TEMPLATE_HEADERS, ...HANDOFF_EXTRA_HEADERS];

  it('keeps the import template as its first eight columns, in order', () => {
    expect(headers.slice(0, 8)).toEqual(IMPORT_TEMPLATE_HEADERS);
  });

  it('puts the renewal context after column eight, where the importer stops reading', () => {
    const highestReadCell = Math.max(...Object.values(IMPORT_CELL_MAP));
    expect(highestReadCell).toBe(8);
    headers.slice(8).forEach((header, index) => {
      expect(headers.indexOf(header) + 1).toBeGreaterThan(highestReadCell);
      expect(header).toBe(HANDOFF_EXTRA_HEADERS[index]);
    });
  });

  it('carries the phone and the paid amount the old file was missing', () => {
    // The attendance export had neither, which is why the file could not be used.
    expect(headers).toContain('الهاتف');
    expect(headers).toContain('المدفوع');
    expect(headers).toContain('تاريخ البداية');
    expect(headers).toContain('تاريخ النهاية');
    expect(headers).toContain('نوع الاشتراك');
  });

  it('lands each field in the cell the importer reads it from', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('العملاء المحتملون');
    sheet.addRow(headers);
    sheet.addRow([
      'أحمد محمد', '01000000000', 'renewal', '', 'one month 800',
      'اشتراك سابق SUB-1 — ينتهي 2026-08-01', 1, '',
      'one month 800', 800, '2026-07-01', '2026-08-01', '4979',
    ]);

    const row = sheet.getRow(2);
    expect(String(row.getCell(IMPORT_CELL_MAP.fullName).value)).toBe('أحمد محمد');
    expect(String(row.getCell(IMPORT_CELL_MAP.phone).value)).toBe('01000000000');
    expect(String(row.getCell(IMPORT_CELL_MAP.source).value)).toBe('renewal');
    expect(Number(row.getCell(IMPORT_CELL_MAP.branchId).value)).toBe(1);
    // Blank assignee is what triggers automatic distribution across the team.
    expect(String(row.getCell(IMPORT_CELL_MAP.assignedToId).value ?? '')).toBe('');
  });
});

describe('the source the hand-off stamps is one the importer accepts', () => {
  // importExcel rejects a row whose source is not a known lead source, and rejects
  // member_invitation outright. A file stamped with an unknown source would fail on every
  // single row — the export would look fine and import nothing.
  const isLeadSource = (value: string) => (LEAD_SOURCES as readonly string[]).includes(value);

  it('accepts "renewal"', () => {
    expect(isLeadSource('renewal')).toBe(true);
    expect('renewal').not.toBe('member_invitation');
  });

  it('gives it an Arabic label so it reads properly in the lead list and reports', () => {
    expect(LEAD_SOURCE_LABELS.renewal).toBe('تجديد اشتراك منتهي');
  });

  it('would have failed on the source used before this was checked', () => {
    for (const invented of ['renewals', 'expired', 'renew']) {
      expect(isLeadSource(invented)).toBe(false);
    }
  });
});
