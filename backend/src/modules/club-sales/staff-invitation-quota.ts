/**
 * Pure rules behind «أكواد الدعوات للموظفين» — kept apart from the service so the quota maths
 * and the input checks are unit-tested without a database.
 */

/** Allowance month (Cairo calendar), e.g. `2026-11`. */
export function invitationPeriod(date: string): string {
  return date.slice(0, 7);
}

/**
 * This month's allowance: the base monthly quota plus every +/− adjustment made for this month.
 * Never negative — taking away more than was given just closes the code for the month.
 */
export function effectiveQuota(monthlyQuota: number, monthAdjustments: number[]): number {
  const total = (monthlyQuota || 0) + monthAdjustments.reduce((sum, delta) => sum + (delta || 0), 0);
  return Math.max(0, total);
}

export function remainingQuota(quota: number, used: number): number {
  return Math.max(0, quota - used);
}

export type QuotaDecision =
  | { ok: true; overQuota: false }
  | { ok: true; overQuota: true }
  | { ok: false; message: string };

/**
 * May one more guest be recorded on this code? Over the allowance only with an override
 * (permission + written reason), which is then logged.
 */
export function decideQuota(input: {
  quota: number;
  used: number;
  canOverride: boolean;
  overrideReason?: string | null;
}): QuotaDecision {
  if (input.used < input.quota) return { ok: true, overQuota: false };
  const reason = input.overrideReason?.trim() ?? '';
  if (!input.canOverride) {
    return {
      ok: false,
      message: `الكود ده خلّص دعواته الشهر ده (المسموح ${input.quota} واتسجل ${input.used}). الرصيد بيتجدد أول الشهر، أو اطلب من الإدارة تزود له.`,
    };
  }
  if (reason.length < 3) {
    return { ok: false, message: 'الكود خلّص دعواته الشهر ده — اكتب سبب التجاوز عشان تسجل الدعوة.' };
  }
  return { ok: true, overQuota: true };
}

/** A +/− from the quick buttons: a non-zero whole number with a written reason. */
export function validateAdjustment(delta: unknown, reason: unknown): { delta: number; reason: string } {
  const value = Number(delta);
  if (!Number.isInteger(value) || value === 0) throw new Error('قيمة التعديل لازم تكون رقم صحيح غير صفر');
  if (Math.abs(value) > 1000) throw new Error('قيمة التعديل كبيرة جدًا');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 3) throw new Error('سبب التعديل مطلوب');
  return { delta: value, reason: text.slice(0, 500) };
}

/** Upper-case letters, digits and dashes, 3–30 characters. */
export function normalizeInvitationCode(raw: string): string {
  const code = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) {
    throw new Error('الكود لازم يكون من 3 لـ 30 حرف إنجليزي أو رقم (مسموح بالشرطة -)');
  }
  return code;
}

/** The suggested code for an employee: `NM` + their employee code (or row id). */
export function suggestedInvitationCode(employee: { id: number; emp_code: number | null }): string {
  return `NM${employee.emp_code && employee.emp_code > 0 ? employee.emp_code : employee.id}`;
}

/**
 * An Egyptian mobile in its stored local form (`01XXXXXXXXX`), or null when it is not one.
 * Accepts +20 / 0020 / 20 prefixes and Arabic-Indic digits.
 */
export function egyptianMobile(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('0020')) local = `0${local.slice(4)}`;
  else if (local.startsWith('20') && local.length === 12) local = `0${local.slice(2)}`;
  else if (local.length === 10 && local.startsWith('1')) local = `0${local}`;
  return /^01[0125]\d{8}$/.test(local) ? local : null;
}

/** The forms the same mobile may be stored in elsewhere (members, leads). */
export function phoneVariants(local: string): string[] {
  return [local, `+20${local.slice(1)}`, `20${local.slice(1)}`];
}

/** Visit date: YYYY-MM-DD, from a week back to a month ahead of today. */
export function validateVisitDate(value: string | null | undefined, today: string): string {
  const date = value?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('تاريخ الزيارة غير صحيح');
  }
  const diffDays = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (diffDays < -7 || diffDays > 31) throw new Error('تاريخ الزيارة لازم يكون من أسبوع فات لحد شهر قدام');
  return date;
}

/** Lead status → what the invitation shows. */
export function invitationOutcome(lead: { status: string; converted_member_id: number | null } | null | undefined) {
  if (!lead) return { key: 'no_lead', label: 'بدون عميل محتمل' };
  if (lead.converted_member_id != null || lead.status === 'converted') return { key: 'converted', label: 'اشترك (بقى عضو)' };
  if (lead.status === 'membership_done' || lead.status === 'qualified') return { key: 'subscribed', label: 'تم الاشتراك — مستني الاستقبال' };
  if (lead.status === 'lost') return { key: 'lost', label: 'غير مهتم' };
  return { key: 'open', label: 'عند السيلز' };
}
