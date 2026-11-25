import { useMemo, useState } from 'react';
import { Check, Dumbbell, X } from 'lucide-react';
import { catalogImageUrl } from '@/components/training/catalog-image';
import { formatDisplayNumber } from '@/lib/number-display';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { TrainingEquipment } from '@/pages/club/fitness/training/model';
import { groupEquipment, nameKey } from './equipment-model';

export { equipmentCategories, equipmentForBranch, groupEquipment, uniqueEquipment } from './equipment-model';

export function EquipmentThumb({ item, className }: { item: Pick<TrainingEquipment, 'imageUrl'>; className?: string }) {
  const src = catalogImageUrl(item.imageUrl);
  return src
    ? <img src={src} alt="" loading="lazy" className={cn('shrink-0 rounded-md bg-muted object-cover', className)} />
    : <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground', className)}><Dumbbell className="size-1/2 max-h-12 max-w-12" /></span>;
}

export function EquipmentChips({ items, ar, empty }: { items: TrainingEquipment[]; ar: boolean; empty?: string }) {
  if (!items.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={ar ? 'الأجهزة' : 'Equipment'}>
      {items.map(item => (
        <li key={item.id} className="flex items-center gap-2 rounded-full border bg-background py-1 pe-3 ps-1 text-sm">
          <EquipmentThumb item={item} className="size-7 rounded-full" />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** Grouped photo tiles; the page scrolls, not a nested box. */
export function EquipmentPicker({
  items,
  value,
  onChange,
  ar,
  max = 10,
}: {
  items: TrainingEquipment[];
  value: number[];
  onChange: (ids: number[]) => void;
  ar: boolean;
  max?: number;
}) {
  const tr = (a: string, e: string) => (ar ? a : e);
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const q = nameKey(search);
    return groupEquipment(q ? items.filter(i => nameKey(i.name).includes(q)) : items);
  }, [items, search]);
  const selected = new Set(value);
  const full = value.length >= max;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {items.length > 8 && (
          <Input
            className="h-10 max-w-xs flex-1"
            aria-label={tr('ابحث في الأجهزة', 'Search equipment')}
            placeholder={tr('ابحث عن جهاز…', 'Search equipment…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}
        <span className="text-sm text-muted-foreground" role="status">
          {value.length ? tr(`تم اختيار ${formatDisplayNumber(value.length)}`, `${formatDisplayNumber(value.length)} selected`) : tr('بدون أجهزة', 'No equipment')}
        </span>
        {!!value.length && (
          <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => onChange([])}>
            <X className="size-4" />{tr('مسح الاختيار', 'Clear')}
          </button>
        )}
      </div>
      {groups.map(({ group, items: groupItems }) => (
        <section key={group.id} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">{ar ? group.ar : group.en} · {formatDisplayNumber(groupItems.length)}</h4>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
            {groupItems.map(item => {
              const on = selected.has(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => onChange(on ? value.filter(id => id !== item.id) : [...value, item.id])}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-lg border bg-background p-2 text-start text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                    on && 'border-brand-600 bg-brand-400/15 hover:bg-brand-400/20',
                  )}
                >
                  <EquipmentThumb item={item} className="size-10" />
                  <span className="min-w-0 flex-1 leading-snug">{item.name}</span>
                  <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on && 'border-brand-600 bg-brand-600 text-white')}>
                    {on && <Check className="size-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="text-sm text-muted-foreground">{tr('لا يوجد جهاز بهذا الاسم.', 'No equipment matches.')}</p>}
      {full && <p className="text-xs text-muted-foreground">{tr(`الحد الأقصى ${formatDisplayNumber(max)} أجهزة لكل تمرين.`, `Up to ${formatDisplayNumber(max)} items per exercise.`)}</p>}
    </div>
  );
}
