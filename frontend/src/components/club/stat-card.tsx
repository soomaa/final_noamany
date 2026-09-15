import type { LucideIcon } from 'lucide-react';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';

/** Semantic tones — each metric family gets a distinct, consistent colour. */
const TONES = {
  revenue: '#2FBF87',
  profit: '#34C38F',
  members: '#F7CE1B',
  attendance: '#38BDF8',
  trainers: '#8B5CF6',
  classes: '#E8A44B',
  lockers: '#14B8A6',
  spa: '#EC4899',
  alert: '#E5736B',
  neutral: '#6FB7E6',
  primary: '#ED1C24',
} as const;

export type StatTone = keyof typeof TONES;

/** Rotating palette used when a label has no obvious semantic match. */
const FALLBACK = [TONES.primary, TONES.members, TONES.attendance, TONES.trainers, TONES.classes, TONES.lockers, TONES.spa];

/** Keyword → tone map (Arabic). Revenue is checked first so "إيرادات السبا" reads as money. */
const KEYWORDS: Array<[StatTone, string[]]> = [
  ['revenue', ['إيراد', 'مبيع', 'خزينة', 'تحصيل', 'مدفوع', 'دخل', 'فاتور', 'إيصال']],
  ['profit', ['ربح', 'صافي']],
  ['alert', ['منتهي', 'متأخر', 'مستحق', 'معلق', 'تنبيه', 'متبق', 'غياب']],
  ['members', ['عضو', 'أعضاء', 'عملاء', 'عميل', 'مشترك']],
  ['attendance', ['حضور', 'نسبة', 'دخول', 'تسجيل', 'داخل']],
  ['trainers', ['مدرب']],
  ['classes', ['حصص', 'حصة', 'فعالي', 'نشاط', 'برنامج']],
  ['lockers', ['لوكر', 'خزائن', 'خزنة']],
  ['spa', ['سبا', 'سبأ']],
];

function toneForLabel(label: string): string {
  for (const [tone, words] of KEYWORDS) {
    if (words.some((w) => label.includes(w))) return TONES[tone];
  }
  // Deterministic fallback so the same label always gets the same colour.
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

interface ClubStatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  suffix?: string;
  /** Override the auto-detected colour. */
  tone?: StatTone;
  className?: string;
  centered?: boolean;
}

export function ClubStatCard({ label, value, icon: Icon, suffix, tone, className, centered = false }: ClubStatCardProps) {
  const color = tone ? TONES[tone] : toneForLabel(label);

  return (
    <div
      className={cn(
        'surface-card group relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      style={{ borderColor: withAlpha(color, 0.32) }}
    >
      {/* Full-card colour — the whole card is evenly tinted with the metric's tone, no glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.13] transition-opacity duration-300 group-hover:opacity-[0.18] dark:opacity-[0.26] dark:group-hover:opacity-[0.32]"
        style={{ backgroundColor: color }}
      />
      <div className={cn('relative flex gap-2', centered ? 'flex-col items-center text-center' : 'items-start justify-between')}>
        <p className="text-sm font-medium text-muted-foreground dark:text-white/85">{label}</p>
        {Icon && (
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: withAlpha(color, 0.18), color, border: `1px solid ${withAlpha(color, 0.3)}` }}
          >
            <Icon className="size-[18px]" />
          </div>
        )}
      </div>
      <p
        className={cn('relative mt-2 text-2xl font-bold tracking-tight nums dark:!text-white', centered && 'text-center')}
        style={{ color }}
      >
        {typeof value === 'number' ? toArabicDigits(value) : value}
        {suffix && <span className="ms-1 text-base font-normal text-muted-foreground dark:text-white/70">{suffix}</span>}
      </p>
    </div>
  );
}
