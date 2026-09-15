import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PrintViewProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Wrapper for printable content — hidden on screen controls, visible in print */
export function PrintView({ title, children, className }: PrintViewProps) {
  return (
    <div className={cn('print-view', className)}>
      <div className="mb-6 hidden print:block">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">80</div>
          <div>
            <div className="text-xl font-bold">Noamany</div>
            <div className="text-xs text-muted-foreground">GYM & FITNESS HUB — {title}</div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
