import { BadgeCheck, CalendarDays, MessageSquare, MessageSquareText, Phone, Users } from 'lucide-react';
import { EmptyState } from '@/components/common/states';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/**
 * One entry of a client's history. The sales workspace writes typed contact outcomes
 * and the Potential Members screen writes free-text comments; both render here so the
 * two screens tell the same story in the same shape.
 */
export interface LeadActivityEntry {
  id: string | number;
  activityType: string;
  note: string;
  answered?: boolean | null;
  interests?: string | null;
  nextFollowUpAt?: string | null;
  nextCallAt?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  call: 'اتصال هاتفي',
  conversation: 'محادثة',
  meeting: 'مقابلة شخصية',
  system: 'تحديث من النظام',
  comment: 'تعليق',
  note: 'ملاحظة',
};

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  conversation: MessageSquareText,
  meeting: Users,
  comment: MessageSquare,
  system: BadgeCheck,
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? ACTIVITY_LABELS.note;
}

/** Date + time. The shared `formatDate` is date-only, and a follow-up needs the hour. */
export function formatActivityWhen(value: string | null | undefined): string {
  return formatDate(value, 'yyyy/MM/dd hh:mm a');
}

export function LeadActivityTimeline({
  entries,
  loading = false,
  className,
  maxHeightClassName = 'max-h-[42rem]',
}: {
  entries?: LeadActivityEntry[];
  loading?: boolean;
  className?: string;
  maxHeightClassName?: string;
}) {
  const { ui } = useLocale();

  return (
    <section className={cn('min-h-0 overflow-hidden rounded-xl border bg-card', className)}>
      <div className="border-b px-4 py-4 sm:px-5">
        <h3 className="font-bold">{ui('سجل نشاط العميل')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {ui('كل الاتصالات والمحادثات والمقابلات بترتيبها الزمني')}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3 p-4 sm:p-5" role="status">
          <span className="sr-only">{ui('جارِ التحميل…')}</span>
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-[10px] bg-muted/50" />
          ))}
        </div>
      ) : !entries?.length ? (
        <EmptyState compact title={ui('لم يتم تسجيل نشاط بعد')} />
      ) : (
        <div className={cn('divide-y overflow-y-auto', maxHeightClassName)}>
          {entries.map((item) => {
            const Icon = ACTIVITY_ICONS[item.activityType] ?? BadgeCheck;
            return (
              <article key={item.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold">{ui(activityLabel(item.activityType))}</h4>
                        {item.activityType === 'call' && item.answered != null ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-bold',
                              item.answered ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {ui(item.answered ? 'تم الرد' : 'لم يتم الرد')}
                          </span>
                        ) : null}
                      </div>
                      <time className="nums text-xs text-muted-foreground">
                        {formatActivityWhen(item.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.note}</p>
                    {item.interests ? (
                      <p className="mt-2 rounded-[8px] bg-muted/35 px-3 py-2 text-xs leading-5">
                        <b>{ui('الاهتمامات:')}</b> {item.interests}
                      </p>
                    ) : null}
                    {item.nextFollowUpAt ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {ui('المتابعة القادمة:')}{' '}
                        <span className="nums">{formatActivityWhen(item.nextFollowUpAt)}</span>
                      </p>
                    ) : null}
                    {item.nextCallAt ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Phone className="size-3.5" />
                        {ui('الاتصال القادم:')} <span className="nums">{formatActivityWhen(item.nextCallAt)}</span>
                      </p>
                    ) : null}
                    {item.createdByName ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {ui('سجّلها')} {item.createdByName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
