import { cn, toArabicDigits } from '@/lib/utils';
import { leadPipelineStages } from '@/pages/sales-portal/sales-workspace-model';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const labels = {
  all: uiStatic('الكل'),
  new: uiStatic('جديد'),
  inProgress: uiStatic('قيد المتابعة'),
  followLater: uiStatic('متابعة لاحقًا'),
  qualified: uiStatic('مؤهل'),
  converted: uiStatic('تم الاشتراك'),
  lost: uiStatic('غير مؤهل'),
} as const;

export function SalesPipelineTabs({
  value,
  onChange,
  counts,
  includeAll = true,
  stages: providedStages,
  className,
}: {
  value: string;
  onChange: (status: string) => void;
  counts?: Partial<Record<string, number>>;
  includeAll?: boolean;
  stages?: ReadonlyArray<(typeof leadPipelineStages)[number]>;
  className?: string;
}) {
  const { ui } = useLocale();
  const stages = providedStages ?? (includeAll ? leadPipelineStages : leadPipelineStages.slice(1));

  return (
    <div className={cn('overflow-x-auto pb-1', className)}>
      <div
        role="tablist"
        aria-label={ui('مراحل متابعة العملاء')}
        className="mx-auto flex w-max min-w-full items-stretch justify-center rounded-xl bg-muted/45 p-1.5"
      >
        {stages.map((stage) => {
          const active = value === stage.status;
          const count = counts?.[stage.status];
          return (
            <button
              key={stage.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(stage.status)}
              style={{ clipPath: 'polygon(0 50%, 14px 0, 100% 0, calc(100% - 14px) 50%, 100% 100%, 14px 100%)' }}
              className={cn(
                'group relative -ms-px flex min-h-11 min-w-[8.25rem] items-center justify-center gap-2 px-5 text-sm font-semibold transition-colors first:ms-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'z-10 bg-foreground text-background'
                  : 'bg-card/70 text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <span>{ui(labels[stage.key])}</span>
              {count != null ? (
                <span className={cn(
                  'nums rounded-full px-2 py-0.5 text-xs tabular-nums',
                  active ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground',
                )}
                >
                  {toArabicDigits(count)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
