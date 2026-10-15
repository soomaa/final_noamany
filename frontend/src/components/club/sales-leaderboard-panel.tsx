import { Crown, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface SalesLeaderboardEntry {
  employeeId: number;
  name: string;
  achievementPct: number;
  rank?: number;
  isCurrent?: boolean;
}

export function SalesLeaderboardPanel({
  rows,
  loading,
}: {
  rows: SalesLeaderboardEntry[];
  loading?: boolean;
}) {
  const { ui } = useLocale();

  if (loading) {
    return <Skeleton className="min-h-[20rem] rounded-xl" />;
  }

  return (
    <section className="surface-card flex min-h-[20rem] flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-bold">{ui('ترتيب فريق المبيعات')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{ui('حسب نسبة تحقيق التارجت')}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-[10px] bg-primary/15 text-foreground">
          <Trophy className="size-4" aria-hidden="true" />
        </span>
      </div>

      {!rows.length ? (
        <EmptyState compact title={ui('لا يوجد ترتيب حاليًا')} />
      ) : (
        <ol className="divide-y">
          {rows.map((row, index) => {
            const rank = row.rank ?? index + 1;
            return (
              <li
                key={row.employeeId}
                className={cn(
                  'flex items-center gap-3 px-5 py-3.5',
                  row.isCurrent && 'bg-primary/[0.06]',
                )}
              >
                <span
                  className={cn(
                    'nums grid size-9 shrink-0 place-items-center rounded-[10px] text-sm font-bold tabular-nums',
                    rank === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {rank === 1 ? (
                    <Crown className="size-4" aria-label={ui('المركز الأول')} />
                  ) : (
                    toArabicDigits(rank)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{row.name}</span>
                    {row.isCurrent ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold">
                        {ui('أنت')}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="nums shrink-0 text-sm font-bold tabular-nums">
                  {toArabicDigits(row.achievementPct)}%
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
