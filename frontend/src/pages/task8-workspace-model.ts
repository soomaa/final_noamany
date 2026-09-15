export type EvaluationCriterion = { id: number; maxScore: number };
export type EvaluationRoleKey = 'trainer' | 'reception' | 'branch_manager';

/** Mirrors the backend's evaluationRoleForJobTitle (evaluation-workflow.service.ts) and
 * job-title-defaults.ts's normalization, so the picker here never disagrees with what the
 * server will actually accept for a real title like "ريسبشن" or "مدربة". */
function normalizeJobTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function evaluationRoleForTitle(title: string | null | undefined): EvaluationRoleKey | null {
  const value = normalizeJobTitle(title ?? '');
  if (!value) return null;
  if (/(مدير عام|مدير فرع|مدير النادي|مشرف عام|مشرف الفرع)/.test(value)) return 'branch_manager';
  if (/(استقبال|ريسبشن|كاشير)/.test(value)) return 'reception';
  if (/(مدرب|مدربه|كوتش)/.test(value)) return 'trainer';
  return null;
}

export function compatibleEvaluationTemplates<
  T extends { role_key: string; branch_id?: number | null },
>(templates: readonly T[], employee: { branchId: number | null; jobTitle: string | null | undefined }) {
  const role = evaluationRoleForTitle(employee.jobTitle);
  if (!role || employee.branchId == null) return [];
  return templates.filter((template) =>
    template.role_key === role
    && (template.branch_id == null || Number(template.branch_id) === Number(employee.branchId)));
}

export function normalizeTask8Tab<T extends string>(candidate: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return candidate && allowed.includes(candidate as T) ? candidate as T : fallback;
}

export function buildCustomerServiceParams(
  tab: 'follow-up' | 'opinions',
  filters: { branchId?: string; gender?: string; membershipStatus?: string; dateFrom?: string; dateTo?: string },
) {
  return {
    ...(filters.branchId ? { branchId: Number(filters.branchId) } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.membershipStatus ? { membershipStatus: filters.membershipStatus } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
    ...(tab === 'opinions' ? { hasOpinion: true } : {}),
  };
}

export function calculateEvaluationTotal(criteria: EvaluationCriterion[], values: Record<number, string>) {
  return criteria.reduce(
    (summary, criterion) => {
      const raw = Number(values[criterion.id]);
      const score = Number.isFinite(raw) ? Math.min(criterion.maxScore, Math.max(0, raw)) : 0;
      return { total: summary.total + score, maximum: summary.maximum + criterion.maxScore };
    },
    { total: 0, maximum: 0 },
  );
}

type LockerCsvInput = {
  id: number;
  inventoryDate: string;
  status: string;
  lines: Array<{
    lockerNumber: string;
    expectedStatus: string;
    actualStatus: string;
    result: string;
    notes?: string | null;
  }>;
};

export function lockerInventoryCsv(input: LockerCsvInput) {
  const rows = [
    'رقم الجلسة,تاريخ الجرد,الحالة',
    [input.id, input.inventoryDate, input.status].map(csvCell).join(','),
    '',
    'اللوكر,الحالة المتوقعة,الحالة الفعلية,النتيجة,الملاحظة',
    ...input.lines.map((line) => [line.lockerNumber, line.expectedStatus, line.actualStatus, line.result, line.notes ?? ''].map(csvCell).join(',')),
  ];
  return `\uFEFF${rows.join('\r\n')}`;
}
import { csvCell } from '../lib/csv.ts';
