import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
}

interface ComboboxProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  /** Optional server-side search callback. When provided, input changes call this instead of local filtering. */
  onSearch?: (query: string) => void;
}

function normalizeArabic(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function Combobox({
  value = '',
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  id,
  'aria-label': ariaLabel,
  className,
  onSearch,
}: ComboboxProps) {
  const { ui } = useLocale();
  const resolvedPlaceholder = placeholder ?? ui('اختر…');
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث…');
  const resolvedEmptyText = emptyText ?? ui('لا توجد نتائج');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalizeArabic(query);
    if (!q) return options;
    return options.filter((o) => normalizeArabic(`${o.label} ${o.description ?? ''} ${o.searchText ?? ''}`).includes(q));
  }, [options, query]);

  const select = useCallback(
    (v: string) => {
      onValueChange(v);
      setOpen(false);
      setQuery('');
    },
    [onValueChange],
  );

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-index="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault();
      select(filtered[highlight].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel ?? resolvedPlaceholder}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected?.label ?? resolvedPlaceholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onKeyDown={onKeyDown}>
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onSearch?.(v);
            }}
            placeholder={resolvedSearchPlaceholder}
            className="h-9"
            autoFocus
            aria-label={resolvedSearchPlaceholder}
          />
        </div>
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="max-h-60 overflow-y-auto p-1"
          aria-label={resolvedPlaceholder}
        >
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{resolvedEmptyText}</p>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                data-index={i}
                aria-selected={opt.value === value}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted',
                  i === highlight && 'bg-muted',
                  opt.value === value && 'font-medium text-primary',
                )}
                onClick={() => select(opt.value)}
                onMouseEnter={() => setHighlight(i)}
              >
                <Check className={cn('size-4 shrink-0', opt.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 text-start">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description ? <span className="block truncate text-xs font-normal text-muted-foreground">{opt.description}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface MultiSelectProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function MultiSelect({
  values,
  onValuesChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  id,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const { ui } = useLocale();
  const resolvedPlaceholder = placeholder ?? ui('اختر…');
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث…');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalizeArabic(query);
    if (!q) return options;
    return options.filter((o) => normalizeArabic(o.label).includes(q));
  }, [options, query]);

  const toggle = (v: string) => {
    onValuesChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  const selectedLabels = options.filter((o) => values.includes(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel ?? resolvedPlaceholder}
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between font-normal"
        >
          <div className="flex flex-wrap gap-1 text-start">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{resolvedPlaceholder}</span>
            ) : (
              selectedLabels.map((o) => (
                <span key={o.value} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs">
                  {o.label}
                  <button
                    type="button"
                    className="rounded-sm hover:bg-primary/20"
                    aria-label={ui(`إزالة ${o.label}`)}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={resolvedSearchPlaceholder}
            className="h-9"
            autoFocus
            aria-label={resolvedSearchPlaceholder}
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable>
          {filtered.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={checked}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted',
                  checked && 'bg-primary/5 font-medium text-primary',
                )}
                onClick={() => toggle(opt.value)}
              >
                <Check className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate text-start">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
