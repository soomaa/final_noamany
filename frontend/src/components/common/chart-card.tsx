import type { ReactElement, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/states';
import { cn } from '@/lib/utils';

/** Shared brand palette for charts — hex only (SVG fill/stroke attrs do not resolve CSS vars). */
export const CHART_COLORS = [
  '#ED1C24',
  '#F7CE1B',
  '#2D8F6F',
  '#D97706',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#0EA5E9',
] as const;

/** Pick a palette colour by index (wraps around). */
export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

interface ChartCardProps {
  title: string;
  icon?: LucideIcon;
  description?: string;
  /** Header-aligned actions (e.g. a "view report" link). */
  action?: ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  /** Chart area height in px. */
  height?: number;
  className?: string;
  /** A single recharts chart element, e.g. <PieChart>…</PieChart>. */
  children: ReactElement;
}

/**
 * Card shell for a dashboard chart: titled header, fixed-height responsive
 * container, and built-in loading / empty states. Keeps every chart on the
 * app visually consistent so dashboards read as one system.
 */
export function ChartCard({
  title,
  icon: Icon,
  description,
  action,
  loading,
  isEmpty,
  emptyText,
  height = 260,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn('border-border/70 shadow-sm', className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="size-5 text-primary" />}
            {title}
          </CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : isEmpty ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <EmptyState title={emptyText ?? '—'} />
          </div>
        ) : (
          <div className="w-full min-w-0" style={{ height }}>
            <ResponsiveContainer width="100%" height={height}>
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
