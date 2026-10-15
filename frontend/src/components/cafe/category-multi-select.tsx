import { formatDisplayNumber } from '@/lib/number-display';
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  filterCafeCategories,
  summarizeCafeCategories,
  toggleCafeCategory,
  type CafeCategoryOption,
} from '@/lib/cafe-category-selection';
import { useLocale } from '@/store/locale';

interface CategoryMultiSelectProps {
  options: CafeCategoryOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  disabled?: boolean;
}

export function CategoryMultiSelect({ options, value, onValueChange, disabled }: CategoryMultiSelectProps) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => filterCafeCategories(options, search), [options, search]);
  const summary = summarizeCafeCategories(options, value, ui('بدون فئة'));

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="h-11 w-full justify-between gap-3 px-3 font-normal"
        >
          <span className="min-w-0 truncate text-start">{summary}</span>
          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {value.length ? <span className="nums rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{formatDisplayNumber(value.length)}</span> : null}
            <ChevronsUpDown className="size-4" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0" dir="rtl">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui('ابحثي عن فئة…')}
              aria-label={ui('ابحثي عن فئة')}
              className="h-10 pe-9"
              autoFocus
            />
          </div>
        </div>
        <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1.5">
          {filtered.length ? filtered.map((option) => {
            const checked = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => onValueChange(toggleCafeCategory(value, option.value, !checked))}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-primary/35"
              >
                <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                <span className="min-w-0 flex-1 break-words">{option.label}</span>
                {checked ? <Check className="size-4 shrink-0 text-primary" /> : null}
              </button>
            );
          }) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{ui('لا توجد فئات مطابقة')}</p>
          )}
        </div>
        {value.length ? (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-center gap-2 text-muted-foreground" onClick={() => onValueChange([])}>
              <X className="size-4" />
              {ui('مسح الاختيارات')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
