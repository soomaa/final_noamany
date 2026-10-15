import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getBrandProfile } from '@/ports/brand-registry';

interface PrintViewProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Wrapper for printable content — hidden on screen controls, visible in print */
export function PrintView({ title, children, className }: PrintViewProps) {
  const brand = getBrandProfile();
  return (
    <div className={cn('print-view', className)}>
      <div className="mb-6 hidden print:block">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">{brand.mark}</div>
          <div>
            <div className="text-xl font-bold">{brand.name}</div>
            <div className="text-xs text-muted-foreground">{brand.tagline} — {title}</div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
