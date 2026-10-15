import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface StatusTab {
  value: string;
  label: string;
  count?: number;
}

interface ListStatusTabsProps {
  tabs: StatusTab[];
  paramKey?: string;
  className?: string;
}

export function ListStatusTabs({ tabs, paramKey = 'status', className }: ListStatusTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get(paramKey) ?? '';

  const select = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(paramKey, value);
    else next.delete(paramKey);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={cn('mb-3 flex flex-wrap gap-1 rounded-xl bg-foreground/[0.03] p-1 dark:bg-white/[0.04]', className)}>
      {tabs.map((tab) => {
        const active = current === tab.value;
        return (
          <button
            key={tab.value || '__all'}
            type="button"
            onClick={() => select(tab.value)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm transition-all duration-150',
              active
                ? 'bg-background font-semibold text-foreground shadow-sm dark:bg-white/[0.12] dark:text-[#F0EAEB] dark:shadow-none'
                : 'text-muted-foreground hover:text-foreground dark:text-[#8E8486] dark:hover:text-[#F0EAEB]',
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  'ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active
                    ? 'bg-primary/15 text-primary dark:bg-white/[0.15] dark:text-[#F0EAEB]'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
