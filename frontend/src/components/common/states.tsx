import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Inbox, RefreshCw, ServerCrash } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed text-center',
        'border-primary/20 bg-gradient-to-b from-primary/[0.04] via-muted/15 to-muted/35',
        'shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.05)]',
        'dark:border-white/35 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
        compact ? 'px-5 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-primary/15 dark:bg-primary/10 dark:ring-primary/25">
        <Icon className="size-7 text-primary/60 dark:text-primary/70" />
      </div>
      <h3 className="text-lg font-semibold dark:text-white">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground dark:text-white/85">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  inline?: boolean;
}

export function ErrorState({ title, message, onRetry, className, inline }: ErrorStateProps) {
  const { t } = useLocale();
  const resolvedTitle = title ?? t('errors.loadFailed');
  const resolvedMessage = message ?? t('errors.loadFailedMessage');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border text-center',
        inline
          ? 'border-border/80 bg-card px-6 py-12 shadow-sm'
          : 'border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-orange-50/40 px-6 py-16 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20',
        className,
      )}
    >
      <div
        className={cn(
          'mb-4 flex size-14 items-center justify-center rounded-2xl',
          inline ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        )}
      >
        {inline ? <ServerCrash className="size-7" /> : <AlertCircle className="size-7" />}
      </div>
      <h3 className={cn('text-lg font-semibold', !inline && 'text-amber-900 dark:text-amber-100')}>{resolvedTitle}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{resolvedMessage}</p>
      {onRetry && (
        <Button variant={inline ? 'default' : 'outline'} className="mt-6 gap-2" onClick={onRetry}>
          <RefreshCw className="size-4" />
          {t('errors.retry')}
        </Button>
      )}
    </div>
  );
}

interface NotImplementedStateProps {
  title?: string;
  className?: string;
}

export function NotImplementedState({ title, className }: NotImplementedStateProps) {
  const { t } = useLocale();
  return (
    <EmptyState
      className={className}
      title={title ?? t('errors.notImplemented')}
      description={t('errors.notImplementedMessage')}
    />
  );
}
