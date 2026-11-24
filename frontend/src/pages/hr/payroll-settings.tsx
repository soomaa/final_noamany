import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Save, ExternalLink, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

/** Mirrors backend/src/modules/hr-payroll-settings/hr-payroll-settings.defaults.ts. */
interface Settings {
  rateIncludeBasic: boolean;
  rateIncludeHousing: boolean;
  rateIncludeTransport: boolean;
  rateIncludeRaise: boolean;
  workingDaysPerMonth: number;
  hoursPerDay: number;
  lateHourMultiplier: number;
  lateCapEnabled: boolean;
  lateCapThresholdMin: number;
  lateCapValueMin: number;
  earlyLeaveDeduct: boolean;
  earlyLeaveHourMultiplier: number;
  permittedEarlyLeaveDeduct: boolean;
  permittedLateDeduct: boolean;
  permittedLateRatePercent: number;
  missingPunchFreePerMonth: number;
  missingPunchFirstDays: number;
  missingPunchSecondDays: number;
  missingPunchThirdPlusDays: number;
  absenceDayMultiplier: number;
  paidLeaveDeductMultiplier: number;
  unpaidLeaveDayMultiplier: number;
  overtimeHourMultiplier: number;
  extraShiftDayMultiplier: number;
  compDayMinWorkedMinutes: number;
  compDayInWeeklyScheduleMode: boolean;
  defaultWeeklyOffDay: string;
  deductionExemptEmpCodes: number[];
  exceptionsTrackingStartDate: string | null;
}
type Key = keyof Settings;

interface SettingsResponse {
  values: Settings;
  defaults: Settings;
  overrides: Partial<Record<Key, { updatedBy: string | null; updatedAt: string | null }>>;
  lastUpdated: { by: string | null; at: string | null } | null;
  exemptEmployees: Array<{ empCode: number; name: string | null }>;
}

const WEEKDAYS: Array<{ value: string; label: string }> = [
  { value: 'Saturday', label: 'السبت' },
  { value: 'Sunday', label: 'الأحد' },
  { value: 'Monday', label: 'الإثنين' },
  { value: 'Tuesday', label: 'الثلاثاء' },
  { value: 'Wednesday', label: 'الأربعاء' },
  { value: 'Thursday', label: 'الخميس' },
  { value: 'Friday', label: 'الجمعة' },
];

const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج`;
const num = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 });
const dayName = (v: string) => WEEKDAYS.find((d) => d.value === v)?.label ?? v;
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
};

/** Example maths, using the same formulas as the payroll engine. */
interface Ex {
  s: Settings;
  salary: number;
  hour: number;
  day: number;
}

interface Field {
  key: Key;
  label: string;
  help: string;
  kind: 'boolean' | 'number' | 'weekday' | 'codes' | 'date';
  unit?: string;
  step?: number;
  min?: number;
  /** Shown only when this returns true (e.g. the cap values when the cap is on). */
  visible?: (s: Settings) => boolean;
  example?: (e: Ex) => string;
  warning?: string;
}

interface Group {
  id: string;
  title: string;
  intro: string;
  fields: Field[];
  example?: (e: Ex) => string;
  footer?: 'overtime-rules';
}

const ladderTotal = (s: Settings, occurrences: number) => {
  let total = 0;
  for (let i = 1; i <= occurrences; i += 1) {
    const step = i - Math.floor(s.missingPunchFreePerMonth);
    if (step <= 0) continue;
    total += step === 1 ? s.missingPunchFirstDays : step === 2 ? s.missingPunchSecondDays : s.missingPunchThirdPlusDays;
  }
  return total;
};

const GROUPS: Group[] = [
  {
    id: 'basis',
    title: 'أساس الحساب',
    intro: 'كل الخصومات والإضافي بتتحسب من «أجر الساعة» و«أجر اليوم». هنا بتحدد إيه اللي يدخل في المرتب اللي بنقسمه، وعلى كام يوم وكام ساعة.',
    example: ({ s, salary, hour, day }) =>
      `مثال: مرتب ${money(salary)} ÷ (${s.workingDaysPerMonth} يوم × ${num(s.hoursPerDay)} ساعات) → أجر الساعة ${money(hour)} وأجر اليوم ${money(day)}`,
    fields: [
      { key: 'rateIncludeBasic', kind: 'boolean', label: 'المرتب الأساسي', help: 'يدخل المرتب الأساسي في حساب أجر الساعة واليوم.' },
      { key: 'rateIncludeHousing', kind: 'boolean', label: 'بدل السكن', help: 'يدخل بدل السكن في حساب أجر الساعة واليوم.' },
      { key: 'rateIncludeTransport', kind: 'boolean', label: 'بدل المواصلات', help: 'يدخل بدل المواصلات في حساب أجر الساعة واليوم.' },
      { key: 'rateIncludeRaise', kind: 'boolean', label: 'زيادات المرتب', help: 'تدخل الزيادات المسجلة على المرتب في حساب أجر الساعة واليوم.' },
      { key: 'workingDaysPerMonth', kind: 'number', unit: 'يوم', step: 1, min: 1, label: 'أيام الشهر', help: 'المرتب بيتقسم على العدد ده عشان نطلع أجر اليوم (مش مرتبط بعدد أيام الشهر الفعلي).' },
      { key: 'hoursPerDay', kind: 'number', unit: 'ساعة', step: 0.5, min: 1, label: 'ساعات اليوم', help: 'أجر اليوم بيتقسم على العدد ده عشان نطلع أجر الساعة.' },
    ],
  },
  {
    id: 'late',
    title: 'التأخير (بدون إذن)',
    intro: 'دقائق التأخير اللي مالهاش إذن معتمد بتتخصم بأجر الساعة. فترة السماح نفسها بتتظبط في «قواعد الدوام».',
    fields: [
      {
        key: 'lateHourMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر الساعة', label: 'قيمة ساعة التأخير',
        help: '1 = كل ساعة تأخير بتتخصم بأجر ساعة واحدة. 2 = بتتخصم بأجر ساعتين.',
        example: ({ s, hour }) => `اتأخر 30 دقيقة بدون إذن → هيتخصم ${money(0.5 * hour * s.lateHourMultiplier)}`,
      },
      {
        key: 'lateCapEnabled', kind: 'boolean', label: 'التأخير الكبير يتحسب نص يوم',
        help: 'لو التأخير في يوم واحد زاد عن الحد اللي تحته، اليوم ده بيتحسب بعدد دقائق ثابت (افتراضيًا 240 دقيقة = نص يوم).',
        example: ({ s, hour }) => s.lateCapEnabled
          ? `اتأخر 150 دقيقة في يوم → هيتحسب ${s.lateCapThresholdMin < 150 ? s.lateCapValueMin : 150} دقيقة = ${money(((s.lateCapThresholdMin < 150 ? s.lateCapValueMin : 150) / 60) * hour * s.lateHourMultiplier)}`
          : `اتأخر 150 دقيقة في يوم → هيتحسب 150 دقيقة بس = ${money(2.5 * hour * s.lateHourMultiplier)}`,
      },
      { key: 'lateCapThresholdMin', kind: 'number', step: 5, min: 0, unit: 'دقيقة', label: 'الحد', help: 'لو تأخير اليوم أكتر من الرقم ده…', visible: (s) => s.lateCapEnabled },
      { key: 'lateCapValueMin', kind: 'number', step: 5, min: 0, unit: 'دقيقة', label: 'يتحسب كأنه', help: '…يتحسب اليوم ده بالعدد ده من الدقائق.', visible: (s) => s.lateCapEnabled },
    ],
  },
  {
    id: 'early-leave',
    title: 'الانصراف المبكر',
    intro: 'دقائق الانصراف قبل ميعاد الانصراف (بعد فترة السماح في «قواعد الدوام»). حاليًا بتتسجل بس ومش بتتخصم من المرتب. الأيام اللي المدير قرر فيها «حضر» أو «معذور» في الحالات اليومية مش بتتخصم.',
    fields: [
      {
        key: 'earlyLeaveDeduct', kind: 'boolean', label: 'خصم الانصراف المبكر',
        help: 'لو فعّلته، دقائق الانصراف المبكر بدون إذن هتتخصم بأجر الساعة.',
        example: ({ s, hour }) => s.earlyLeaveDeduct
          ? `مشي بدري 30 دقيقة بدون إذن → هيتخصم ${money(0.5 * hour * s.earlyLeaveHourMultiplier)}`
          : 'مشي بدري 30 دقيقة → مش هيتخصم حاجة (زي دلوقتي)',
      },
      {
        key: 'earlyLeaveHourMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر الساعة', label: 'قيمة ساعة الانصراف المبكر',
        help: '1 = كل ساعة انصراف مبكر بتتخصم بأجر ساعة.', visible: (s) => s.earlyLeaveDeduct,
      },
      {
        key: 'permittedEarlyLeaveDeduct', kind: 'boolean', label: 'خصم الانصراف المبكر اللي عليه إذن',
        help: 'لو اليوم عليه إذن معتمد (أو قرار «إذن» في الحالات اليومية). مقفول = الإذن بيعفيه من الخصم.',
        visible: (s) => s.earlyLeaveDeduct,
        example: ({ s, hour }) => s.permittedEarlyLeaveDeduct
          ? `مشي بدري 30 دقيقة بإذن → هيتخصم ${money(0.5 * hour * s.earlyLeaveHourMultiplier)}`
          : 'مشي بدري 30 دقيقة بإذن → مش هيتخصم حاجة',
      },
    ],
  },
  {
    id: 'permissions',
    title: 'الأذونات',
    intro: 'التأخير اللي عليه إذن معتمد نهائيًا (أو قرار «إذن» في الحالات اليومية). حاليًا بيتخصم زي التأخير العادي بالظبط — تقدر تلغي خصمه أو تقلله.',
    fields: [
      {
        key: 'permittedLateDeduct', kind: 'boolean', label: 'خصم التأخير اللي عليه إذن',
        help: 'لو قفلته، التأخير اللي عليه إذن معتمد مش هيتخصم خالص.',
        example: ({ s, hour }) => s.permittedLateDeduct
          ? `اتأخر 30 دقيقة بإذن → هيتخصم ${money(0.5 * hour * (s.permittedLateRatePercent / 100))}`
          : 'اتأخر 30 دقيقة بإذن → مش هيتخصم حاجة',
      },
      {
        key: 'permittedLateRatePercent', kind: 'number', step: 5, min: 0, unit: '% من أجر الساعة', label: 'نسبة الخصم',
        help: '100% = زي التأخير العادي، 50% = نص القيمة.', visible: (s) => s.permittedLateDeduct,
      },
    ],
  },
  {
    id: 'missing-punch',
    title: 'البصمة المنسية',
    intro: 'لما الموظف يبصم حضور بس أو انصراف بس. العدّ بيبدأ من الأول كل شهر مرتبات، وكل مرة بتتخصم أكتر من اللي قبلها.',
    example: ({ s, day }) => {
      const days = ladderTotal(s, 3);
      return `نسي البصمة 3 مرات في الشهر → يتخصم ${num(days)} يوم = ${money(days * day)}`;
    },
    fields: [
      { key: 'missingPunchFreePerMonth', kind: 'number', step: 1, min: 0, unit: 'مرة', label: 'مرات مسموحة في الشهر', help: 'أول كام مرة في الشهر مش بتتخصم، والسلم بيبدأ بعدها. 0 = مفيش سماح.' },
      { key: 'missingPunchFirstDays', kind: 'number', step: 0.25, min: 0, unit: 'يوم', label: 'أول مرة', help: 'قيمة الخصم لأول مرة (0.25 = ربع يوم).', example: ({ s, day }) => `= ${money(s.missingPunchFirstDays * day)}` },
      { key: 'missingPunchSecondDays', kind: 'number', step: 0.25, min: 0, unit: 'يوم', label: 'تاني مرة', help: 'قيمة الخصم لتاني مرة (0.5 = نص يوم).', example: ({ s, day }) => `= ${money(s.missingPunchSecondDays * day)}` },
      { key: 'missingPunchThirdPlusDays', kind: 'number', step: 0.25, min: 0, unit: 'يوم', label: 'تالت مرة وأي مرة بعدها', help: 'قيمة الخصم لكل مرة من التالتة وطالع (1 = يوم كامل).', example: ({ s, day }) => `= ${money(s.missingPunchThirdPlusDays * day)}` },
    ],
  },
  {
    id: 'absence',
    title: 'الغياب والإجازات',
    intro: 'يوم الغياب هو يوم شغل مفيهوش أي بصمة ولا إجازة معتمدة ولا عطلة رسمية.',
    fields: [
      {
        key: 'absenceDayMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر اليوم', label: 'خصم يوم الغياب',
        help: '1 = يوم الغياب بيتخصم بأجر يوم. 2 = بأجر يومين.',
        example: ({ s, day }) => `غاب يوم → هيتخصم ${money(day * s.absenceDayMultiplier)}`,
      },
      {
        key: 'unpaidLeaveDayMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر اليوم', label: 'خصم يوم الإجازة بدون مرتب',
        help: 'الإجازة المعتمدة من نوع «بدون مرتب».',
        example: ({ s, day }) => `يوم إجازة بدون مرتب → هيتخصم ${money(day * s.unpaidLeaveDayMultiplier)}`,
      },
      {
        key: 'paidLeaveDeductMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر اليوم', label: 'خصم يوم الإجازة بمرتب («خصم الإجازات»)',
        help: 'النظام القديم بيخصم أيام الإجازات المعتمدة اللي بمرتب (سنوية، مرضية…) بأجر اليوم في بند «خصم الإجازات». لو المرتب بيتصرف عادي في الإجازة، خلّيها 0.',
        warning: 'لو حطيت رقم أكبر من 0، الإجازة «بمرتب» هتتخصم من المرتب. القرار: الإجازة المدفوعة ما تتخصمش (0).',
        example: ({ s, day }) => s.paidLeaveDeductMultiplier > 0
          ? `أخد يوم إجازة سنوية معتمدة → هيتخصم ${money(day * s.paidLeaveDeductMultiplier)}`
          : 'أخد يوم إجازة سنوية معتمدة → مش هيتخصم حاجة',
      },
    ],
  },
  {
    id: 'overtime',
    title: 'الإضافي',
    intro: 'الساعات الإضافية المسجلة والشيفتات الإضافية اللي اتبصم فيها بتتصرف مع المرتب.',
    footer: 'overtime-rules',
    fields: [
      {
        key: 'overtimeHourMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر الساعة', label: 'قيمة ساعة الإضافي',
        help: '1 = ساعة الإضافي بأجر ساعة عادية. 1.5 = ساعة ونص.',
        example: ({ s, hour }) => `اشتغل ساعتين إضافي → هيتصرفله ${money(2 * hour * s.overtimeHourMultiplier)}`,
      },
      {
        key: 'extraShiftDayMultiplier', kind: 'number', step: 0.25, min: 0, unit: '× أجر اليوم', label: 'قيمة الشيفت الإضافي',
        help: 'الشيفت الإضافي (مش البديل) اللي اتبصم فيه فعلًا بيتصرف بأجر يوم مضروب في الرقم ده.',
        example: ({ s, day }) => `اشتغل شيفت إضافي → هيتصرفله ${money(day * s.extraShiftDayMultiplier)}`,
      },
    ],
  },
  {
    id: 'comp-days',
    title: 'أيام البدل',
    intro: 'لما الموظف يشتغل يوم إجازته الأسبوعية (حضور وانصراف) بيتسجله «يوم بدل راحة» ياخده بعدين كإجازة بدل راحة.',
    fields: [
      {
        key: 'compDayMinWorkedMinutes', kind: 'number', step: 30, min: 0, unit: 'دقيقة', label: 'أقل مدة شغل عشان يتحسب يوم بدل',
        help: '0 = أي حضور وانصراف يوم الإجازة بيتحسب. لو حطيت 240، لازم يشتغل 4 ساعات على الأقل (الشيفتات في نفس اليوم بتتجمع).',
        example: ({ s }) => `اشتغل 3 ساعات يوم إجازته → ${s.compDayMinWorkedMinutes <= 180 ? 'هيتحسبله يوم بدل' : 'مش هيتحسبله يوم بدل'}`,
      },
      {
        key: 'compDayInWeeklyScheduleMode', kind: 'boolean', label: 'أيام البدل في نظام الجدول الأسبوعي',
        help: 'لو الفرع شغال بالجدول الأسبوعي: اللي يشتغل (بشيفت بديل) في يوم متسجل له «راحة» في جدوله ياخد يوم بدل. لو قفلته، أيام البدل تتحسب بس في النظام القديم (يوم الإجازة الثابت).',
      },
    ],
  },
  {
    id: 'weekly-off',
    title: 'الإجازة الأسبوعية',
    intro: 'لكل موظف يوم إجازة أسبوعية في «الإجازات الأسبوعية». اليوم ده بيتستخدم بس للموظف اللي ملوش يوم متسجل.',
    fields: [
      {
        key: 'defaultWeeklyOffDay', kind: 'weekday', label: 'يوم الإجازة الافتراضي',
        help: 'بيتستخدم في حساب الغياب في المرتبات وفي تقرير الغياب للموظف اللي ملوش يوم إجازة متسجل.',
        example: ({ s }) => `موظف ملوش يوم إجازة متسجل → يوم ${dayName(s.defaultWeeklyOffDay)} مش هيتحسب عليه غياب`,
      },
    ],
  },
  {
    id: 'exempt',
    title: 'المستثنون من الخصم',
    intro: 'الموظفين دول مش بيتخصم منهم غياب ولا تأخير ولا بصمة منسية ولا إجازات (السلف والجزاءات والتأمينات بتتخصم عادي).',
    fields: [
      {
        key: 'deductionExemptEmpCodes', kind: 'codes', label: 'أكواد الموظفين',
        help: 'اكتب أكواد الموظفين مفصولة بفاصلة (مثال: 27, 2, 3). القائمة الافتراضية جاية من إعداد السيرفر PAYROLL_DEDUCTION_EXEMPT_EMP_CODES.',
      },
    ],
  },
  {
    id: 'exceptions',
    title: 'الحالات اليومية',
    intro: 'صفحة «الحالات اليومية» بتطلع كل يوم فيه غياب أو بصمة ناقصة أو تأخير عشان المدير يقرر فيه، ومنها التنبيهات والتذكيرات والتصعيد.',
    fields: [
      {
        key: 'exceptionsTrackingStartDate', kind: 'date', label: 'بداية متابعة الحالات',
        help: 'الحالات اللي قبل التاريخ ده مش بتظهر ولا بتتعد في التنبيه ولا بيتبعت عليها تذكير أو تصعيد. اتظبط على يوم تشغيل النظام عشان التاريخ القديم مايغرقش المديرين. فاضي = كل التاريخ.',
        example: ({ s }) => s.exceptionsTrackingStartDate
          ? `غياب يوم قبل ${s.exceptionsTrackingStartDate} → مش هيظهر للمدير ولا هيتبعت عليه تذكير`
          : 'كل الأيام القديمة هتظهر في الحالات اليومية',
      },
    ],
  },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function PayrollSettingsPage() {
  const { ui } = useLocale();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr', 'payroll-settings'],
    queryFn: async () => (await api.get<SettingsResponse>('/hr/payroll-settings')).data,
    retry: false,
  });
  /** Edited values; `null` = reset to default on save. */
  const [draft, setDraft] = useState<Partial<Record<Key, unknown>>>({});
  /** Raw text of the codes box while typing. */
  const [codesText, setCodesText] = useState<string | null>(null);
  const [exampleSalary, setExampleSalary] = useState('6000');
  const [saving, setSaving] = useState(false);

  const effective = useMemo<Settings | null>(() => {
    if (!data) return null;
    const out = { ...data.values } as Record<Key, unknown>;
    for (const [key, value] of Object.entries(draft) as Array<[Key, unknown]>) {
      out[key] = value === null ? data.defaults[key] : value;
    }
    return out as unknown as Settings;
  }, [data, draft]);

  const ex = useMemo<Ex | null>(() => {
    if (!effective) return null;
    const salary = Math.max(0, Number(exampleSalary) || 0);
    const hours = effective.workingDaysPerMonth * effective.hoursPerDay;
    const hour = hours > 0 ? salary / hours : 0;
    return { s: effective, salary, hour, day: hour * effective.hoursPerDay };
  }, [effective, exampleSalary]);

  const changedKeys = useMemo(() => {
    if (!data) return [] as Key[];
    return (Object.keys(draft) as Key[]).filter((key) => {
      const value = draft[key];
      if (value === null) return Boolean(data.overrides[key]);
      return !same(value, data.values[key]);
    });
  }, [data, draft]);

  const setValue = (key: Key, value: unknown) => setDraft((prev) => ({ ...prev, [key]: value }));

  const resetField = (key: Key) => {
    setDraft((prev) => ({ ...prev, [key]: null }));
    if (key === 'deductionExemptEmpCodes') setCodesText(null);
  };

  const save = async () => {
    if (!data || !changedKeys.length) return;
    const values: Record<string, unknown> = {};
    for (const key of changedKeys) values[key] = draft[key];
    setSaving(true);
    try {
      await api.put('/hr/payroll-settings', { values });
      toast.success(ui('تم حفظ إعدادات الحضور والمرتبات — هتتطبق على المرتبات اللي هتتحسب من دلوقتي'));
      setDraft({});
      setCodesText(null);
      await refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data || !effective || !ex) {
    return (
      <div className="space-y-6">
        <PageHeader title={ui('إعدادات الحضور والمرتبات')} />
        <p className="text-sm text-muted-foreground">{isLoading ? ui('جاري التحميل…') : ui('تعذّر تحميل الإعدادات')}</p>
      </div>
    );
  }

  const renderControl = (field: Field) => {
    const value = effective[field.key];
    switch (field.kind) {
      case 'boolean':
        return <Switch checked={Boolean(value)} onCheckedChange={(v) => setValue(field.key, v)} />;
      case 'number':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              className="nums w-28"
              step={field.step}
              min={field.min}
              value={String(value ?? '')}
              onChange={(e) => setValue(field.key, e.target.value === '' ? '' : Number(e.target.value))}
            />
            {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
          </div>
        );
      case 'weekday':
        return (
          <Select value={String(value)} onValueChange={(v) => setValue(field.key, v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'date':
        return (
          <Input
            type="date"
            dir="ltr"
            className="nums w-44"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setValue(field.key, e.target.value || '')}
          />
        );
      case 'codes':
        return (
          <Input
            dir="ltr"
            className="nums w-full sm:w-80"
            placeholder="27, 2, 3"
            value={codesText ?? (value as number[]).join(', ')}
            onChange={(e) => {
              setCodesText(e.target.value);
              const codes = e.target.value.split(/[\s,،]+/).filter(Boolean).map(Number);
              setValue(field.key, codes.every((c) => Number.isInteger(c) && c > 0) ? [...new Set(codes)] : e.target.value);
            }}
          />
        );
    }
  };

  const describeDefault = (field: Field) => {
    const d = data.defaults[field.key];
    if (field.kind === 'boolean') return d ? 'مفعّل' : 'مقفول';
    if (field.kind === 'weekday') return dayName(String(d));
    if (field.kind === 'date') return d ? String(d) : 'من غير تاريخ (كل التاريخ)';
    if (field.kind === 'codes') return (d as number[]).length ? (d as number[]).join(', ') : 'مفيش';
    return `${num(Number(d))}${field.unit ? ` ${field.unit}` : ''}`;
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title={ui('إعدادات الحضور والمرتبات')}
        description={ui('كل قواعد الخصم والإضافي اللي بيستخدمها حساب المرتبات. القيم الافتراضية هي نفس طريقة الحساب الحالية، ومفيش حاجة بتتغير غير لما تعدّل وتحفظ.')}
        actions={
          <Button onClick={() => void save()} disabled={saving || !changedKeys.length}>
            <Save className="h-4 w-4" />
            {saving ? ui('جاري الحفظ…') : changedKeys.length ? `${ui('حفظ')} (${changedKeys.length})` : ui('حفظ')}
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Label htmlFor="example-salary" className="whitespace-nowrap text-sm">{ui('مرتب المثال')}</Label>
            <Input id="example-salary" type="number" inputMode="decimal" className="nums w-32" value={exampleSalary} onChange={(e) => setExampleSalary(e.target.value)} />
            <span className="text-xs text-muted-foreground">{ui('كل الأمثلة تحت محسوبة على المرتب ده')}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {data.lastUpdated?.at
              ? `${ui('آخر تعديل')}: ${data.lastUpdated.by ?? '—'} · ${fmtDate(data.lastUpdated.at)}`
              : ui('لسه محدش عدّل — كل القيم افتراضية')}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <Card key={group.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ui(group.title)}</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{group.intro}</p>
              {group.example && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-sm font-medium nums">{group.example(ex)}</p>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {group.fields.filter((field) => !field.visible || field.visible(effective)).map((field) => {
                const override = data.overrides[field.key];
                const pendingReset = draft[field.key] === null;
                const isDefault = same(effective[field.key], data.defaults[field.key]);
                const edited = changedKeys.includes(field.key);
                return (
                  <div key={field.key} className={`space-y-2 rounded-lg border p-3 ${edited ? 'border-primary/60 bg-primary/5' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm font-semibold">{field.label}</Label>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{field.help}</p>
                      </div>
                      {renderControl(field)}
                    </div>
                    {field.example && (
                      <p className="text-sm text-foreground/90 nums">← {field.example(ex)}</p>
                    )}
                    {field.kind === 'codes' && data.exemptEmployees.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 text-xs">
                        {data.exemptEmployees.map((emp) => (
                          <li key={emp.empCode} className="rounded bg-muted px-2 py-0.5 nums">
                            {emp.empCode} — {emp.name ?? ui('غير موجود')}
                          </li>
                        ))}
                      </ul>
                    )}
                    {field.warning && !same(effective[field.key], 0) && (
                      <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {field.warning}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {ui('الافتراضي')}: {describeDefault(field)}
                        {override && !pendingReset && ` · ${ui('اتعدّل بواسطة')} ${override.updatedBy ?? '—'} ${fmtDate(override.updatedAt)}`}
                      </span>
                      {!isDefault && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => resetField(field.key)}>
                          <RotateCcw className="h-3 w-3" />
                          {ui('رجوع للافتراضي')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {group.footer === 'overtime-rules' && (
                <Link to="/attendance/rules" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {ui('بداية احتساب الإضافي ومعامله وفترة سماح التأخير والانصراف المبكر من «قواعد الدوام»')}
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{ui('ملاحظات')}</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>• التعديلات بتتطبق على أي مرتب يتحسب بعد الحفظ؛ المسيّرات اللي اترحّلت قبل كده مش بتتغير.</p>
        </CardContent>
      </Card>
    </div>
  );
}
