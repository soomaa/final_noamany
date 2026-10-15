import type { ReactNode } from 'react';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { NotImplementedState } from '@/components/common/states';
import { isNotImplemented } from '@/lib/api-hooks';
import { useLocale } from '@/store/locale';

interface StatItem {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  colorIndex?: number;
}

interface ListPageShellProps {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  stats?: StatItem[];
  statsLoading?: boolean;
  searchPlaceholder?: string;
  isError?: boolean;
  error?: unknown;
  isLoading?: boolean;
  onRetry?: () => void;
  notImplementedTitle?: string;
  children: ReactNode;
}

export function ListPageShell({
  title,
  description,
  eyebrow,
  actions,
  stats,
  statsLoading,
  searchPlaceholder,
  isError,
  error,
  notImplementedTitle,
  children,
}: ListPageShellProps) {
  const { ui } = useLocale();

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        {title ? <PageHeader title={title} description={description} eyebrow={eyebrow} /> : null}
        <NotImplementedState
          title={notImplementedTitle ?? ui(`${title ?? ''} — قيد الإعداد على الخادم`)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {title ? (
        <PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} />
      ) : actions ? (
        <div className="flex justify-end">{actions}</div>
      ) : null}
      {stats && stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <StatCard
              key={s.title}
              title={s.title}
              value={s.value}
              subtitle={s.subtitle}
              icon={s.icon}
              colorIndex={s.colorIndex ?? i}
              loading={statsLoading}
            />
          ))}
        </div>
      )}
      {searchPlaceholder && <FilterBar searchPlaceholder={searchPlaceholder} />}
      {children}
    </div>
  );
}
