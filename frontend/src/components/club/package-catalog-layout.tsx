import { Building2, Search, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn, toArabicDigits } from '@/lib/utils';

/**
 * Shared shell for the catalog tabs on /club/packages/settings — regular packages, private
 * packages and scheduled classes. Each one owns a tab now, so the section reads as a headed
 * panel rather than a box stacked inside another box.
 */

export type CatalogTone = 'emerald' | 'violet' | 'sky';

const toneStyles: Record<CatalogTone, {
  icon: string;
  chip: string;
  glow: string;
  bar: string;
  hover: string;
}> = {
  emerald: {
    icon: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    glow: 'from-emerald-500/[0.08]',
    bar: 'bg-emerald-500/70',
    hover: 'hover:border-emerald-500/40',
  },
  violet: {
    icon: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    chip: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    glow: 'from-violet-500/[0.08]',
    bar: 'bg-violet-500/70',
    hover: 'hover:border-violet-500/40',
  },
  sky: {
    icon: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    chip: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    glow: 'from-sky-500/[0.08]',
    bar: 'bg-sky-500/70',
    hover: 'hover:border-sky-500/40',
  },
};

/** Case-insensitive name match used by every catalog tab's search box. */
export function matchesCatalogSearch(name: string, query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return name.toLowerCase().includes(term);
}

/** Search box for one catalog tab; filters the tab's own list by package name. */
export function CatalogSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-input bg-background ps-9 pe-9 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function CatalogSection({
  title,
  description,
  icon: Icon,
  tone,
  count,
  action,
  search,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: CatalogTone;
  count: number;
  action?: ReactNode;
  /** Optional search box rendered in the header next to the action. */
  search?: ReactNode;
  children: ReactNode;
}) {
  const style = toneStyles[tone];
  return (
    <section className="space-y-5">
      <header
        className={cn(
          'flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-l to-transparent p-5 shadow-sm',
          style.glow,
        )}
      >
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm', style.icon)}>
          <Icon className="size-5.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold nums', style.chip)}>
              {toArabicDigits(count)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {search ? <div className="w-full sm:w-auto">{search}</div> : null}
        {action}
      </header>
      {children}
    </section>
  );
}

export function CatalogGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function CatalogEmpty({ label }: { label: string }) {
  return (
    <p className="col-span-full rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}

/**
 * One package tile: a tone bar, the name and kind badge, its stats as a divided strip, an
 * optional note, and the row of actions pinned to the bottom so every card ends level.
 */
export function CatalogCard({
  name,
  badge,
  badgeTone,
  accent,
  stats,
  footnote,
  note,
  actions,
}: {
  name: string;
  badge: string;
  badgeTone: CatalogTone;
  /** Optional colour dot (scheduled classes carry a calendar colour). */
  accent?: string;
  stats: Array<{ label: string; value: ReactNode }>;
  footnote?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
}) {
  const style = toneStyles[badgeTone];
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        style.hover,
      )}
    >
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', style.bar)} />

      <div className="flex items-start justify-between gap-3 p-5 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {accent ? (
              <span
                className="size-3 shrink-0 rounded-full ring-4 ring-muted"
                style={{ backgroundColor: accent }}
              />
            ) : null}
            <h3 className="break-words text-base font-bold leading-snug">{name}</h3>
          </div>
          {footnote ? (
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Building2 className="size-3.5 shrink-0" />
              {footnote}
            </p>
          ) : null}
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', style.chip)}>
          {badge}
        </span>
      </div>

      <div className="grid grid-cols-2 border-y bg-muted/30">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn('px-5 py-3', index % 2 === 1 && 'border-s', index >= 2 && 'border-t')}
          >
            <span className="block text-[11px] font-medium text-muted-foreground">{stat.label}</span>
            <b className="mt-0.5 block text-[15px] font-bold nums">{stat.value}</b>
          </div>
        ))}
      </div>

      {note ? <div className="px-5 pt-3 text-xs">{note}</div> : null}

      {actions ? (
        <div className="mt-auto flex flex-wrap items-center gap-1 px-3 py-2.5">{actions}</div>
      ) : null}
    </article>
  );
}
