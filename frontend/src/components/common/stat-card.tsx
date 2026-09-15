import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNum } from '@/lib/formatters';
import { cn, withAlpha } from '@/lib/utils';

const COLORS = [
  '#ED1C24',
  '#ED1C24',
  '#F7CE1B',
  '#2D8F6F',
  '#D97706',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
] as const;

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  colorIndex?: number;
  sparkline?: { v: number }[];
  loading?: boolean;
  className?: string;
  /** When set, the card navigates to this route on click. */
  to?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  colorIndex = 0,
  sparkline,
  loading,
  className,
  to,
}: StatCardProps) {
  const color = COLORS[colorIndex % COLORS.length];

  if (loading) {
    return (
      <Card className={cn('border-border/70 p-5 shadow-sm', className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-16" />
        <Skeleton className="mt-2 h-3 w-32" />
      </Card>
    );
  }

  const cardBody = (
    <Card
      className={cn(
        'group relative overflow-hidden border p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
        to && 'cursor-pointer',
        className,
      )}
      style={{ borderColor: withAlpha(color, 0.32) }}
    >
      {/* Full-card colour — the whole card is evenly tinted with the metric's tone, no glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.13] transition-opacity duration-300 group-hover:opacity-[0.18] dark:opacity-[0.26] dark:group-hover:opacity-[0.32]"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground dark:text-white/85">{title}</p>
          <p className="mt-1.5 text-3xl font-bold nums tabular-nums tracking-tight dark:!text-white" style={{ color }}>
            {typeof value === 'number' ? formatNum(value) : value}
          </p>
          {subtitle && <p className="mt-1.5 text-xs text-muted-foreground dark:text-white/80">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: withAlpha(color, 0.18), color, border: `1px solid ${withAlpha(color, 0.3)}` }}
          >
            {icon}
          </div>
        )}
      </div>
      {sparkline && sparkline.length > 0 && (
        <div className="relative mt-4 h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline}>
              <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block no-underline">
        {cardBody}
      </Link>
    );
  }

  return cardBody;
}
