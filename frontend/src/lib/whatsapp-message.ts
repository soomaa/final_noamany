/**
 * WhatsApp message templates for subscriptions (ported from Meta Fit's «قوالب واتساب»).
 *
 * Dependency-free on purpose: `test/whatsapp-message.test.cjs` imports this file directly.
 *
 * Rule for every template: a line whose variable has no value (empty, or a zero amount/count)
 * is dropped from the message entirely — the member never sees «المتبقي: 0».
 */

export const WHATSAPP_KINDS = [
  'subscription',
  'renewal',
  'payment',
  'freeze',
  'unfreeze',
  'transfer',
  'current_subscriptions',
  'current_subscription_item',
  'expiring',
  'expired',
  'package_details',
] as const;
export type WhatsAppKind = (typeof WHATSAPP_KINDS)[number];
export type WhatsAppTemplates = Record<WhatsAppKind, string>;

export const WHATSAPP_KIND_LABELS: Record<WhatsAppKind, string> = {
  subscription: 'اشتراك جديد',
  renewal: 'تجديد الاشتراك',
  payment: 'سداد دفعة',
  freeze: 'تجميد الاشتراك',
  unfreeze: 'فك التجميد',
  transfer: 'نقل الاشتراك',
  current_subscriptions: 'اشتراكاتي الحالية — الرسالة',
  current_subscription_item: 'اشتراكاتي الحالية — تفاصيل كل اشتراك',
  expiring: 'تذكير قرب الانتهاء',
  expired: 'اشتراك منتهي (دعوة للتجديد)',
  package_details: 'تفاصيل باقة',
};

export const WHATSAPP_KIND_HINTS: Record<WhatsAppKind, string> = {
  subscription: 'بيتبعت من زر «حفظ وإرسال واتساب» في إضافة اشتراك.',
  renewal: 'لرسالة تجديد الاشتراك.',
  payment: 'لرسالة سداد دفعة من المتبقي.',
  freeze: 'لرسالة تجميد الاشتراك.',
  unfreeze: 'لرسالة فك التجميد.',
  transfer: 'لرسالة نقل الاشتراك لباقة تانية.',
  current_subscriptions: 'رسالة الاستقبال (سكان العضو ← أيقونة الواتساب). {{subscriptions}} مكان تفاصيل الاشتراكات المختارة.',
  current_subscription_item: 'بيتكرر لكل اشتراك مختار جوه رسالة «اشتراكاتي الحالية».',
  expiring: 'زر الواتساب في «اشتراكات تنتهي قريباً».',
  expired: 'زر الواتساب في «الاشتراكات المنتهية».',
  package_details: 'تاب «اشتراك واحد» في واتساب العضو: تختاري أي باقة وتبعتي تفاصيلها.',
};

export const WHATSAPP_FIELDS = [
  'member_name', 'gym_name', 'member_code', 'branch_name', 'today',
  'package_name', 'subscription_number', 'status', 'registration_date', 'start_date', 'end_date',
  'days_left', 'days_since_expiry', 'subscription_value', 'discount_amount', 'net_amount',
  'paid_amount', 'remaining_amount', 'payment_amount', 'receipt_number', 'coach_name',
  'sessions_left', 'invitations_left', 'benefits', 'freeze_start', 'freeze_end',
  'previous_package', 'refund_amount', 'subscriptions', 'subscriptions_count', 'duration', 'offer',
] as const;
export type WhatsAppField = (typeof WHATSAPP_FIELDS)[number];
export type WhatsAppValues = Partial<Record<WhatsAppField, string>>;

export const WHATSAPP_FIELD_LABELS: Record<WhatsAppField, string> = {
  member_name: 'اسم العضو',
  gym_name: 'اسم الجيم',
  member_code: 'كود العضو',
  branch_name: 'الفرع',
  today: 'تاريخ اليوم',
  package_name: 'الباقة',
  subscription_number: 'رقم الاشتراك',
  status: 'حالة الاشتراك',
  registration_date: 'تاريخ التسجيل',
  start_date: 'تاريخ البداية',
  end_date: 'تاريخ الانتهاء',
  days_left: 'الأيام المتبقية',
  days_since_expiry: 'أيام من الانتهاء',
  subscription_value: 'قيمة الاشتراك',
  discount_amount: 'الخصم',
  net_amount: 'صافي الاشتراك',
  paid_amount: 'المدفوع',
  remaining_amount: 'المتبقي',
  payment_amount: 'المبلغ المسدّد الآن',
  receipt_number: 'رقم الإيصال',
  coach_name: 'الكابتن',
  sessions_left: 'الحصص المتبقية',
  invitations_left: 'الدعوات المتبقية',
  benefits: 'مميزات الاشتراك',
  freeze_start: 'بداية التجميد',
  freeze_end: 'نهاية التجميد',
  previous_package: 'الباقة السابقة',
  refund_amount: 'المبلغ المسترد',
  subscriptions: 'تفاصيل الاشتراكات',
  subscriptions_count: 'عدد الاشتراكات',
  duration: 'مدة الباقة',
  offer: 'العرض الخاص',
};

const SUBSCRIPTION_FIELDS: WhatsAppField[] = [
  'member_name', 'gym_name', 'member_code', 'branch_name', 'package_name', 'subscription_number', 'status',
  'registration_date', 'start_date', 'end_date', 'days_left', 'subscription_value', 'discount_amount',
  'net_amount', 'paid_amount', 'remaining_amount', 'receipt_number', 'coach_name', 'sessions_left',
  'invitations_left', 'benefits',
];

/** The variable buttons offered for each template in the settings screen. */
export const WHATSAPP_KIND_FIELDS: Record<WhatsAppKind, WhatsAppField[]> = {
  subscription: SUBSCRIPTION_FIELDS,
  renewal: SUBSCRIPTION_FIELDS,
  payment: [...SUBSCRIPTION_FIELDS, 'payment_amount'],
  freeze: [...SUBSCRIPTION_FIELDS, 'freeze_start', 'freeze_end'],
  unfreeze: SUBSCRIPTION_FIELDS,
  transfer: [...SUBSCRIPTION_FIELDS, 'previous_package', 'payment_amount', 'refund_amount'],
  current_subscriptions: ['member_name', 'gym_name', 'member_code', 'today', 'subscriptions', 'subscriptions_count'],
  current_subscription_item: [
    ...SUBSCRIPTION_FIELDS.filter((field) => !['member_name', 'gym_name', 'member_code'].includes(field)),
    'days_since_expiry', 'freeze_start', 'freeze_end',
  ],
  expiring: [...SUBSCRIPTION_FIELDS, 'days_left'],
  expired: [...SUBSCRIPTION_FIELDS, 'days_since_expiry'],
  package_details: ['member_name', 'gym_name', 'branch_name', 'package_name', 'subscription_value', 'offer', 'duration', 'benefits'],
};

const DETAILS = [
  'الباقة: {{package_name}}',
  'رقم الاشتراك: {{subscription_number}}',
  'البداية: {{start_date}}',
  'الانتهاء: {{end_date}}',
  'قيمة الاشتراك: {{subscription_value}}',
  'الخصم: {{discount_amount}}',
  'الصافي: {{net_amount}}',
  'المدفوع: {{paid_amount}}',
  'المتبقي عليك: {{remaining_amount}}',
  'رقم الإيصال: {{receipt_number}}',
  'الكابتن: {{coach_name}}',
  '{{benefits}}',
].join('\n');

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplates = {
  subscription: `أهلًا {{member_name}} 👋\nتم تأكيد اشتراكك في {{gym_name}}\n\n${DETAILS}\n\nنتمنالك تمرين ممتع 💪`,
  renewal: `أهلًا {{member_name}} 👋\nتم تجديد اشتراكك في {{gym_name}}\n\n${DETAILS}`,
  payment: [
    'أهلًا {{member_name}} 👋',
    'تم تسجيل دفعتك في {{gym_name}}',
    '',
    'الباقة: {{package_name}}',
    'المبلغ المسدّد الآن: {{payment_amount}}',
    'إجمالي المدفوع: {{paid_amount}}',
    'المتبقي عليك: {{remaining_amount}}',
    'رقم الإيصال: {{receipt_number}}',
    'رقم الاشتراك: {{subscription_number}}',
  ].join('\n'),
  freeze: [
    'أهلًا {{member_name}} 👋',
    'تم تجميد اشتراكك في {{gym_name}}',
    '',
    'الباقة: {{package_name}}',
    'بداية التجميد: {{freeze_start}}',
    'موعد فك التجميد: {{freeze_end}}',
    'رقم الاشتراك: {{subscription_number}}',
  ].join('\n'),
  unfreeze: [
    'أهلًا {{member_name}} 👋',
    'تم فك تجميد اشتراكك في {{gym_name}}',
    '',
    'الباقة: {{package_name}}',
    'تاريخ الانتهاء الجديد: {{end_date}}',
    'رقم الاشتراك: {{subscription_number}}',
  ].join('\n'),
  transfer: [
    'أهلًا {{member_name}} 👋',
    'تم نقل اشتراكك في {{gym_name}}',
    '',
    'من باقة: {{previous_package}}',
    'إلى باقة: {{package_name}}',
    'المبلغ المحصّل الآن: {{payment_amount}}',
    'المبلغ المسترد: {{refund_amount}}',
    DETAILS,
  ].join('\n'),
  current_subscriptions: [
    'أهلًا {{member_name}} 👋',
    '{{gym_name}}',
    'كود العضو: {{member_code}}',
    'تفاصيل اشتراكاتك بتاريخ {{today}}:',
    '',
    '{{subscriptions}}',
  ].join('\n'),
  current_subscription_item: [
    '*{{package_name}}*',
    'رقم الاشتراك: {{subscription_number}}',
    'الحالة: {{status}}',
    'تاريخ التسجيل: {{registration_date}}',
    'البداية: {{start_date}}',
    'الانتهاء: {{end_date}}',
    'الأيام المتبقية: {{days_left}}',
    'انتهى من: {{days_since_expiry}} يوم',
    'قيمة الاشتراك: {{subscription_value}}',
    'الخصم: {{discount_amount}}',
    'الصافي: {{net_amount}}',
    'المدفوع: {{paid_amount}}',
    'المتبقي عليك: {{remaining_amount}}',
    'الكابتن: {{coach_name}}',
    'الحصص المتبقية: {{sessions_left}}',
    'الدعوات المتبقية: {{invitations_left}}',
    'التجميد الحالي: من {{freeze_start}} إلى {{freeze_end}}',
    '{{benefits}}',
  ].join('\n'),
  expiring: [
    'أهلًا {{member_name}} 👋',
    'بنفكّرك إن اشتراكك ({{package_name}}) في {{gym_name}} هينتهي يوم {{end_date}}',
    'فاضل {{days_left}} يوم',
    'المتبقي عليك: {{remaining_amount}}',
    'جدّد دلوقتي عشان تكمّل تمرينك من غير انقطاع 💪',
  ].join('\n'),
  expired: [
    'أهلًا {{member_name}} 👋',
    'اشتراكك ({{package_name}}) في {{gym_name}} انتهى يوم {{end_date}}',
    'المتبقي عليك: {{remaining_amount}}',
    'وحشتنا! جدّد اشتراكك وارجع لتمرينك تاني 💪',
  ].join('\n'),
  package_details: [
    'أهلًا {{member_name}} 👋',
    'تفاصيل باقة *{{package_name}}* في {{gym_name}}:',
    '',
    'السعر: {{subscription_value}}',
    'العرض الخاص: {{offer}}',
    'المدة: {{duration}}',
    '{{benefits}}',
    '',
    'للاشتراك كلّمنا أو تعالى الريسبشن 💪',
  ].join('\n'),
};

export const WHATSAPP_TEMPLATE_MAX_LENGTH = 3000;
const FIELD_SET = new Set<string>(WHATSAPP_FIELDS);
const TOKEN = /\{\{([a-z_]+)\}\}/g;

/** Non-empty, ≤3000 characters, every `{{…}}` a known variable and no stray braces. */
export function validWhatsAppTemplate(text: unknown): text is string {
  if (typeof text !== 'string' || !text.trim() || text.length > WHATSAPP_TEMPLATE_MAX_LENGTH) return false;
  return !/[{}]/.test(text.replace(TOKEN, (token, field: string) => (FIELD_SET.has(field) ? '' : token)));
}

/** Saved templates from the API over the defaults; anything missing or invalid falls back. */
export function mergeWhatsAppTemplates(saved: unknown): WhatsAppTemplates {
  const result = { ...DEFAULT_WHATSAPP_TEMPLATES };
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const kind of WHATSAPP_KINDS) {
      const text = (saved as Record<string, unknown>)[kind];
      if (validWhatsAppTemplate(text)) result[kind] = text;
    }
  }
  return result;
}

/**
 * Fill a template. A line that uses a variable with no value is removed entirely, so zero
 * amounts/counts (rendered as '') never reach the member. Blank-line runs collapse to one.
 */
export function renderWhatsAppTemplate(template: string, values: WhatsAppValues): string {
  const lines: string[] = [];
  for (const line of template.split(/\r?\n/)) {
    const fields = [...line.matchAll(TOKEN)].map((match) => match[1] as WhatsAppField);
    if (fields.some((field) => !values[field]?.trim())) continue;
    lines.push(line.replace(TOKEN, (_token, field: string) => values[field as WhatsAppField] ?? ''));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

export interface MessageSubscription {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  subscriptionTypeName?: string | null;
  registrationDate?: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  status: string;
  subscriptionValue?: number | null;
  discountEnabled?: boolean;
  discountValue?: number | null;
  paidAmount?: number | null;
  remainingAmount?: number | null;
  receiptNumber?: string | null;
  assignedStaffName?: string | null;
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
  privatePackageId?: number | null;
  allowMultipleDailyEntries?: boolean;
  isTimeBased?: boolean;
  timeFrom?: string | null;
  timeTo?: string | null;
  activeFreeze?: { startDate: string; plannedEndDate: string | null } | null;
  customerName?: string | null;
  memberCode?: string | null;
  branchName?: string | null;
}

/** Allowances the subscription row itself does not carry (reception overview / invitations). */
export interface MessageExtras {
  invitationsLeft?: number | null;
  inbodyLeft?: number | null;
  spaLeft?: number | null;
}

export interface MessageContext {
  today: string;
  gymName: string;
  memberName?: string | null;
  memberCode?: string | null;
  extras?: MessageExtras;
}

const NO_EXPIRY = '2099';

/** Whole calendar days from `today` to `date` (both YYYY-MM-DD); null for open-ended or invalid. */
export function daysBetween(today: string, date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today) || date.startsWith(NO_EXPIRY)) return null;
  const difference = (Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(difference) ? Math.round(difference) : null;
}

export function formatMessageDate(value: string | null | undefined): string {
  if (!value) return '';
  if (value.startsWith(NO_EXPIRY)) return 'غير محدد';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
    : '';
}

/** Positive amounts only; zero/negative/missing → '' (the line is dropped). */
export function messageAmount(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0.005) return '';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} ج.م`;
}

/** Positive whole counts only; zero/negative/missing → ''. */
export function messageCount(value: number | null | undefined): string {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 1 ? String(Math.floor(count)) : '';
}

const clean = (text: string | null | undefined) => (text ?? '').trim();

export function subscriptionStatusLabel(sub: Pick<MessageSubscription, 'status' | 'subscriptionStartDate' | 'subscriptionEndDate'>, today: string): string {
  const daysLeft = daysBetween(today, sub.subscriptionEndDate);
  if (sub.status === 'frozen') return 'مجمد';
  if (sub.status === 'expired' || (daysLeft != null && daysLeft < 0)) return 'منتهي';
  if (sub.status === 'upcoming' || sub.subscriptionStartDate.slice(0, 10) > today) return 'لم يبدأ بعد';
  return 'نشط';
}

/** Current = frozen, running or not started yet (not ended before today). */
export function isCurrentSubscription(sub: Pick<MessageSubscription, 'status' | 'subscriptionEndDate'>, today: string): boolean {
  if (sub.status === 'frozen') return true;
  return sub.subscriptionEndDate.startsWith(NO_EXPIRY) || sub.subscriptionEndDate.slice(0, 10) >= today;
}

export function subscriptionBenefits(sub: MessageSubscription, extras: MessageExtras = {}): string {
  const lines: string[] = [];
  const inbody = messageCount(extras.inbodyLeft);
  if (inbody) lines.push(`جلسات InBody المتبقية: ${inbody}`);
  const spa = messageCount(extras.spaLeft);
  if (spa) lines.push(`جلسات SPA المتبقية: ${spa}`);
  if (sub.allowMultipleDailyEntries) lines.push('الدخول أكثر من مرة في اليوم');
  if (sub.isTimeBased && sub.timeFrom && sub.timeTo) lines.push(`مواعيد الدخول: ${sub.timeFrom} — ${sub.timeTo}`);
  return lines.join('\n');
}

/** Every per-subscription variable; zero amounts and counts come back as ''. */
export function subscriptionValues(sub: MessageSubscription, context: MessageContext): WhatsAppValues {
  const value = Number(sub.subscriptionValue ?? 0);
  const discount = sub.discountEnabled === false ? 0 : Math.max(0, Number(sub.discountValue ?? 0));
  const daysLeft = daysBetween(context.today, sub.subscriptionEndDate);
  const sessionsLeft = sub.isLinkedToSessions && sub.sessionsCount != null
    ? Math.max(0, sub.sessionsCount - (sub.sessionsUsed ?? 0))
    : null;
  const freeze = sub.activeFreeze;
  return {
    member_name: clean(context.memberName ?? sub.customerName),
    gym_name: clean(context.gymName),
    member_code: clean(context.memberCode ?? sub.memberCode),
    branch_name: clean(sub.branchName),
    today: formatMessageDate(context.today),
    package_name: clean(sub.subscriptionTypeName || sub.subscriptionType) || 'اشتراك',
    subscription_number: clean(sub.subscriptionNumber),
    status: subscriptionStatusLabel(sub, context.today),
    registration_date: formatMessageDate(sub.registrationDate),
    start_date: formatMessageDate(sub.subscriptionStartDate),
    end_date: formatMessageDate(sub.subscriptionEndDate),
    days_left: daysLeft != null && daysLeft > 0 ? String(daysLeft) : '',
    days_since_expiry: daysLeft != null && daysLeft < 0 ? String(-daysLeft) : '',
    subscription_value: messageAmount(value),
    discount_amount: messageAmount(discount),
    // The net line only adds information when there is a discount.
    net_amount: discount > 0 ? messageAmount(Math.max(0, value - discount)) : '',
    paid_amount: messageAmount(sub.paidAmount),
    remaining_amount: messageAmount(sub.remainingAmount),
    receipt_number: clean(sub.receiptNumber),
    coach_name: clean(sub.assignedStaffName),
    sessions_left: messageCount(sessionsLeft),
    invitations_left: messageCount(context.extras?.invitationsLeft),
    benefits: subscriptionBenefits(sub, context.extras),
    freeze_start: freeze ? formatMessageDate(freeze.startDate) : '',
    freeze_end: freeze ? (freeze.plannedEndDate ? formatMessageDate(freeze.plannedEndDate) : 'غير محدد') : '',
  };
}

/** One subscription in one template (new subscription, expiring reminder, …). */
export function subscriptionMessage(
  template: string,
  sub: MessageSubscription,
  context: MessageContext,
  operation: WhatsAppValues = {},
): string {
  return renderWhatsAppTemplate(template, { ...subscriptionValues(sub, context), ...operation });
}

/** «اشتراكاتي الحالية»: one message holding every chosen subscription, in the order given. */
export function memberSubscriptionsMessage(
  templates: Pick<WhatsAppTemplates, 'current_subscriptions' | 'current_subscription_item'>,
  member: { name: string; memberCode: string },
  subscriptions: readonly MessageSubscription[],
  options: { today: string; gymName: string; extras?: Record<number, MessageExtras> },
): string {
  if (!subscriptions.length) return '';
  const blocks = subscriptions
    .map((sub) => renderWhatsAppTemplate(templates.current_subscription_item, subscriptionValues(sub, {
      today: options.today,
      gymName: options.gymName,
      memberName: member.name,
      memberCode: member.memberCode,
      extras: options.extras?.[sub.id],
    })))
    .filter(Boolean);
  return renderWhatsAppTemplate(templates.current_subscriptions, {
    member_name: clean(member.name),
    gym_name: clean(options.gymName),
    member_code: clean(member.memberCode),
    today: formatMessageDate(options.today),
    subscriptions: blocks.join('\n\n'),
    subscriptions_count: messageCount(blocks.length),
  });
}

/** Sample values for the settings preview. */
export const SAMPLE_SUBSCRIPTION: MessageSubscription = {
  id: 1,
  subscriptionNumber: 'SUB-1001',
  subscriptionType: '٣ شهور',
  registrationDate: '2026-11-01',
  subscriptionStartDate: '2026-11-01',
  subscriptionEndDate: '2027-01-31',
  status: 'active',
  subscriptionValue: 1500,
  discountEnabled: true,
  discountValue: 100,
  paidAmount: 1000,
  remainingAmount: 400,
  receiptNumber: 'REC-2001',
  assignedStaffName: 'كابتن محمد',
  customerName: 'أحمد',
  memberCode: '1024',
  activeFreeze: null,
};

// ---------------------------------------------------------------------------------------------
// Package details («اشتراك واحد» tab): any package of the branch, not one of the member's own.
// ---------------------------------------------------------------------------------------------

export interface MessagePackage {
  name: string;
  price: number;
  days: number;
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  invitationsCount?: number | null;
  inbodyCount?: number | null;
  includesSpa?: boolean;
  spaCount?: number | null;
  isLinkedToFreeze?: boolean;
  freezeDays?: number | null;
  freezeTotalDays?: number | null;
  walletPoints?: number | null;
  promoLive?: boolean;
  promoPrice?: number | null;
  promoLabel?: string | null;
  promoEndsOn?: string | null;
}

/** "30 يوم" or "12 حصة خلال 30 يوم"; '' when unknown. */
export function packageDuration(pkg: MessagePackage): string {
  const days = messageCount(pkg.days);
  const sessions = pkg.isLinkedToSessions ? messageCount(pkg.sessionsCount) : '';
  if (sessions) return days ? `${sessions} حصة خلال ${days} يوم` : `${sessions} حصة`;
  return days ? `${days} يوم` : '';
}

/** One line per included allowance; zero / missing allowances are left out. */
export function packageBenefits(pkg: MessagePackage): string {
  const lines: string[] = [];
  const invitations = messageCount(pkg.invitationsCount);
  if (invitations) lines.push(`الدعوات: ${invitations}`);
  const inbody = messageCount(pkg.inbodyCount);
  if (inbody) lines.push(`جلسات InBody: ${inbody}`);
  const spa = pkg.includesSpa ? messageCount(pkg.spaCount) : '';
  if (spa) lines.push(`جلسات SPA: ${spa}`);
  if (pkg.isLinkedToFreeze) {
    const days = messageCount(pkg.freezeTotalDays);
    const times = messageCount(pkg.freezeDays);
    if (days || times) lines.push(`التجميد: ${[days && `${days} يوم`, times && `${times} مرة`].filter(Boolean).join(' · ')}`);
    else lines.push('التجميد متاح');
  }
  const points = messageCount(pkg.walletPoints);
  if (points) lines.push(`نقاط المحفظة: ${points}`);
  return lines.join('\n');
}

export function packageValues(pkg: MessagePackage, context: { gymName: string; memberName?: string | null; branchName?: string | null; today: string }): WhatsAppValues {
  const offerParts = pkg.promoLive && Number(pkg.promoPrice) > 0
    ? [messageAmount(pkg.promoPrice), clean(pkg.promoLabel), pkg.promoEndsOn ? `لحد ${formatMessageDate(pkg.promoEndsOn)}` : ''].filter(Boolean)
    : [];
  return {
    member_name: clean(context.memberName),
    gym_name: clean(context.gymName),
    branch_name: clean(context.branchName),
    today: formatMessageDate(context.today),
    package_name: clean(pkg.name) || 'باقة',
    subscription_value: messageAmount(pkg.price),
    offer: offerParts.join(' · '),
    duration: packageDuration(pkg),
    benefits: packageBenefits(pkg),
  };
}

export function packageMessage(template: string, pkg: MessagePackage, context: Parameters<typeof packageValues>[1]): string {
  return renderWhatsAppTemplate(template, packageValues(pkg, context));
}

/** Sample package for the settings preview. */
export const SAMPLE_PACKAGE: MessagePackage = {
  name: '٣ شهور', price: 1500, days: 90, invitationsCount: 3, inbodyCount: 2, includesSpa: false, spaCount: 0,
  isLinkedToFreeze: true, freezeTotalDays: 15, freezeDays: null, walletPoints: 0,
  promoLive: true, promoPrice: 1200, promoLabel: '+15 أيام إضافية', promoEndsOn: '2026-12-31',
};
