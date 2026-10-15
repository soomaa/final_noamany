import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

const STATUS_STYLES = {
  active: 'bg-success/15 text-success border-success/30',
  present: 'bg-success/15 text-success border-success/30',
  approved: 'bg-success/15 text-success border-success/30',
  paid: 'bg-success/15 text-success border-success/30',
  suspended: 'bg-destructive/15 text-destructive border-destructive/30',
  absent: 'bg-destructive/15 text-destructive border-destructive/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  blocked: 'bg-destructive/15 text-destructive border-destructive/30',
  expired: 'bg-destructive/15 text-destructive border-destructive/30',
  late: 'bg-warning/15 text-warning border-warning/30',
  pending: 'bg-warning/15 text-warning border-warning/30',
  expiring: 'bg-warning/15 text-warning border-warning/30',
  probation: 'bg-warning/15 text-warning border-warning/30',
  leave: 'bg-primary/15 text-primary border-primary/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  unset: 'bg-warning/15 text-warning border-warning/30',
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;

interface StatusBadgeProps {
  status: StatusKey;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { t } = useLocale();
  const classNameStyle = STATUS_STYLES[status] ?? STATUS_STYLES.info;
  const defaultLabel = t(`status.${status}`);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        classNameStyle,
        className,
      )}
    >
      {label ?? defaultLabel}
    </span>
  );
}

export function GenderBadge({ gender }: { gender: 1 | 2 | number | null }) {
  const { t } = useLocale();
  if (gender === 1) return <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('gender.men')}</span>;
  if (gender === 2) return <span className="text-xs font-medium text-pink-600 dark:text-pink-400">{t('gender.women')}</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}
