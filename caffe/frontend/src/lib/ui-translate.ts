import type { Locale } from '@/store/locale';

type PatternRule = [RegExp, (...groups: string[]) => string];

function translateLoadingFragment(ar: string): string {
  const map: Record<string, string> = {
    'التحميل': 'Loading',
    'التحميل…': 'Loading…',
    'الحفظ': 'Saving',
    'الحفظ…': 'Saving…',
    'الرفع': 'Uploading',
    'الرفع…': 'Uploading…',
  };
  if (map[ar]) return map[ar];
  return `Loading ${ar}`;
}

const DYNAMIC_PATTERNS: PatternRule[] = [
  [/^متوسط (.+) د$/, (value) => `Average ${value} min`],
  [/^متوسط (.+) دقيقة$/, (value) => `Average ${value} min`],
  [/^نسبة الحضور منخفضة \((.+)%\) — راجع لوحة الحضور$/, (value) => `Attendance is low (${value}%) — review the attendance board`],
  [/^بحث في (.+)…$/, (x) => `Search in ${x}…`],
  [/^بحث ب(.+)…$/, (x) => `Search by ${x}…`],
  [/^بحث بال(.+)…$/, (x) => `Search by ${x}…`],
  [/^بحث (.+)…$/, (x) => `Search ${x}…`],
  [/^لا توجد بيانات في (.+)$/, (x) => `No data in ${x}`],
  [/^(.+) — قيد الإعداد على الخادم$/, (x) => `${x} — pending server setup`],
  [/^(.+) — الوحدة قيد الترحيل$/, (x) => `${x} — module pending migration`],
  [/^(.+) مطلوب$/, (x) => `${x} is required`],
  [/^إزالة (.+)$/, (x) => `Remove ${x}`],
  [/^الحد الأقصى (\d+) ميجابايت$/, (n) => `Maximum ${n} MB`],
  [/^جارٍ (.+)$/, (x) => translateLoadingFragment(x)],
  [/^سيتم حذف (\d+) إشعار نهائيًا\.$/, (n) => `${n} notifications will be permanently deleted.`],
  [/^تنفيذ خطوة «(.+)»؟$/, (x) => `Run step "${x}"?`],
  [/^تم إنشاء الإشعار — مُرسل: (\d+) · بدون جهاز: (\d+)$/, (sent, skipped) => `Notification created — sent: ${sent} · no device: ${skipped}`],
];

/** Translate inline Arabic UI copy to English (exact map + dynamic patterns). */
export function translateUiText(
  text: string,
  locale: Locale,
  map: Record<string, string>,
): string {
  if (!text || locale === 'ar') return text;

  const exact = map[text];
  if (exact && exact !== text) return exact;

  for (const [re, build] of DYNAMIC_PATTERNS) {
    const match = text.match(re);
    if (match) return build(...match.slice(1));
  }

  return exact ?? text;
}
