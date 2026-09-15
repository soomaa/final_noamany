import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { navRouteIcon } from '@/lib/nav';

export interface QuickAccessItem {
  to: string;
  label: string;
  icon?: LucideIcon;
}

export function QuickAccessCard({ to, label, icon: Icon }: QuickAccessItem) {
  const ResolvedIcon = Icon ?? navRouteIcon(to);
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-secondary/30 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 dark:from-primary/[0.14] dark:via-card dark:to-primary/[0.06]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-[0_4px_14px_-4px_rgba(201,151,0,0.6)] transition-all group-hover:scale-105 group-hover:bg-primary group-hover:text-white group-hover:shadow-[0_6px_20px_-4px_rgba(201,151,0,0.8)]">
          <ResolvedIcon className="size-5" />
        </div>
        <span className="truncate font-semibold">{label}</span>
      </div>
      <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
    </Link>
  );
}

export function QuickAccessGrid({ items }: { items: QuickAccessItem[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <QuickAccessCard key={item.to} {...item} />
      ))}
    </div>
  );
}
