import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Structured multi-section form dialogs (members, subscriptions, packages, …). */
export const FORM_DIALOG_CONTENT_CLASS =
  'flex max-h-[92dvh] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,64rem)]';

interface DialogFormSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function DialogFormSection({ title, description, icon: Icon, children, className }: DialogFormSectionProps) {
  return (
    <section
      className={cn(
        'space-y-5 rounded-2xl border border-border/70 bg-gradient-to-br from-muted/25 via-card to-primary/[0.03] p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/50 pb-4">
        {Icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
            <Icon className="size-[18px]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

interface DialogFormGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function DialogFormGrid({ children, columns = 2, className }: DialogFormGridProps) {
  return (
    <div
      className={cn(
        'grid gap-5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DialogFormSummaryProps {
  items: Array<{ label: string; value: React.ReactNode; accent?: 'default' | 'success' | 'warning' }>;
}

const summaryAccent: Record<NonNullable<DialogFormSummaryProps['items'][number]['accent']>, string> = {
  default: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
};

export function DialogFormSummary({ items }: DialogFormSummaryProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/90 p-4 shadow-sm sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-muted/35 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className={cn('mt-1 text-lg font-semibold nums', summaryAccent[item.accent ?? 'default'])}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

interface DialogFormToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}

export function DialogFormToggle({ label, hint, checked, onCheckedChange, children }: DialogFormToggleProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
        checked ? 'border-primary/40 bg-primary/5 shadow-sm' : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded border-input accent-primary"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        {children}
      </span>
    </label>
  );
}

export function FormDialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DialogHeader className={cn('shrink-0 border-b border-border/60 bg-muted/20 px-8 py-5', className)}>
      {children}
    </DialogHeader>
  );
}

export function FormDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-6', className)}>{children}</div>;
}

export function FormDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DialogFooter className={cn('relative z-10 shrink-0 border-t border-border/60 bg-muted/15 px-8 py-4', className)}>
      {children}
    </DialogFooter>
  );
}
