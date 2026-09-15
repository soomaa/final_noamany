import { cn } from '@/lib/utils';

interface DialogSectionTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogSectionTitle({ children, className }: DialogSectionTitleProps) {
  return (
    <h3
      className={cn(
        'border-b pb-2 mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </h3>
  );
}
