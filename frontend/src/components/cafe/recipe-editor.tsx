import { Check, ChevronsUpDown, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/store/locale';
import type { RecipeUnit } from '@/types/cafe';
import type { ProductListItem } from '@/types/inventory';
import type { InventorySection } from '@/types/inventory';
import { cafeUnitLabel, compatibleCafeUnitOptions, convertCafeUnit, defaultCafeRecipeUnit } from '@/lib/cafe-units';
import { cn } from '@/lib/utils';
import { InlineRawMaterialDialog } from './inline-raw-material-dialog';

export interface RecipeLine {
  ingredientId: number;
  quantity: number;
  unit: RecipeUnit;
}

export interface RecipeIngredientOption {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  size?: string | null;
  unitOfMeasure: string;
  costPrice?: number;
  inventorySection?: InventorySection;
  inventoryKind?: 'general' | 'raw_material' | 'ready_product' | 'manufactured_internal';
}

interface RecipeEditorProps {
  recipes: RecipeLine[];
  onChange: (recipes: RecipeLine[]) => void;
  ingredientOptions: RecipeIngredientOption[];
  disabled?: boolean;
  onIngredientCreated?: (material: ProductListItem) => void;
}

type IngredientGroupKey = 'preparation' | 'packaging' | 'manufactured' | 'ready' | 'other';

const INGREDIENT_GROUP_ORDER: IngredientGroupKey[] = [
  'preparation',
  'packaging',
  'manufactured',
  'ready',
  'other',
];

function ingredientGroup(option: RecipeIngredientOption): IngredientGroupKey {
  if (option.inventoryKind === 'manufactured_internal') return 'manufactured';
  if (option.inventorySection === 'serving_packaging') return 'packaging';
  if (option.inventorySection === 'ready_products' || option.inventoryKind === 'ready_product') return 'ready';
  if (option.inventorySection === 'preparation_ingredients' || option.inventoryKind === 'raw_material') return 'preparation';
  return 'other';
}

function normalizeIngredientSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ar')
    .normalize('NFD')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function IngredientCombobox({
  value,
  options,
  onValueChange,
  disabled,
  placeholder,
}: {
  value: string;
  options: RecipeIngredientOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => String(option.id) === value);

  const groupMeta: Record<IngredientGroupKey, { label: string; headerClass: string; dotClass: string }> = {
    preparation: {
      label: ui('خامات التحضير'),
      headerClass: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/45 dark:text-amber-100',
      dotClass: 'bg-amber-500',
    },
    packaging: {
      label: ui('مستلزمات التقديم والتغليف'),
      headerClass: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/45 dark:text-sky-100',
      dotClass: 'bg-sky-500',
    },
    manufactured: {
      label: ui('الخامات المصنّعة داخليًا'),
      headerClass: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/45 dark:text-violet-100',
      dotClass: 'bg-violet-500',
    },
    ready: {
      label: ui('المنتجات الجاهزة'),
      headerClass: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/45 dark:text-emerald-100',
      dotClass: 'bg-emerald-500',
    },
    other: {
      label: ui('عناصر مخزون أخرى'),
      headerClass: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100',
      dotClass: 'bg-slate-500',
    },
  };

  const filteredGroups = useMemo(() => {
    const normalizedQuery = normalizeIngredientSearch(query);
    const filtered = options.filter((option) => {
      if (!normalizedQuery) return true;
      const searchable = normalizeIngredientSearch([
        option.nameAr,
        option.nameEn ?? '',
        option.size ?? '',
        option.unitOfMeasure,
        cafeUnitLabel(option.unitOfMeasure),
        groupMeta[ingredientGroup(option)].label,
      ].join(' '));
      return searchable.includes(normalizedQuery);
    });
    return INGREDIENT_GROUP_ORDER
      .map((key) => ({
        key,
        options: filtered.filter((option) => ingredientGroup(option) === key),
      }))
      .filter((group) => group.options.length > 0);
  }, [groupMeta, options, query]);

  const resultCount = filteredGroups.reduce((total, group) => total + group.options.length, 0);
  const selectedMeta = selected ? groupMeta[ingredientGroup(selected)] : null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
      // This combobox is portalled from inside a modal Dialog. Keeping the
      // popover modal gives it the active scroll lock, so wheel and touch
      // gestures reach the long results list instead of being blocked.
      modal
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-10 w-full justify-between gap-3 px-3 py-2 font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          {selected ? (
            <span className="min-w-0 text-start">
              <span className="block truncate font-semibold text-foreground">
                {selected.nameAr}{selected.size ? ` — ${selected.size}` : ''}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-2 rounded-full', selectedMeta?.dotClass)} />
                <span className="truncate">{selectedMeta?.label}</span>
                <span>•</span>
                <span>{cafeUnitLabel(selected.unitOfMeasure)}</span>
              </span>
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,36rem)] overflow-hidden rounded-2xl p-0 shadow-2xl"
      >
        <div className="border-b bg-background/95 p-3 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ui('ابحث بالاسم أو المقاس أو الوحدة…')}
              className="h-11 pe-10"
              aria-label={ui('بحث في مكونات الوصفة')}
            />
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            {resultCount} {ui('عنصر متاح — اختر من القسم المناسب')}
          </p>
        </div>
        <div className="max-h-[24rem] touch-pan-y space-y-2 overflow-y-auto overscroll-contain bg-muted/15 p-2 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
          {filteredGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
              {ui('لا توجد خامة مطابقة للبحث')}
            </p>
          ) : filteredGroups.map((group) => {
            const meta = groupMeta[group.key];
            return (
              <section key={group.key} className="overflow-hidden rounded-xl border bg-background">
                <div className={cn('flex items-center justify-between gap-3 border-b px-3 py-2', meta.headerClass)}>
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className={cn('size-2.5 rounded-full ring-4 ring-current/10', meta.dotClass)} />
                    {meta.label}
                  </span>
                  <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-bold">
                    {group.options.length}
                  </span>
                </div>
                <div className="grid gap-1 p-1.5">
                  {group.options.map((option) => {
                    const optionValue = String(option.id);
                    const isSelected = optionValue === value;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onValueChange(optionValue);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-muted',
                          isSelected && 'bg-primary/10 text-primary ring-1 ring-primary/20',
                        )}
                      >
                        <Check className={cn('size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {option.nameAr}{option.size ? ` — ${option.size}` : ''}
                          </span>
                          {option.nameEn ? (
                            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                              {option.nameEn}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 rounded-md border bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                          {cafeUnitLabel(option.unitOfMeasure)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function RecipeEditor({
  recipes,
  onChange,
  ingredientOptions,
  disabled,
  onIngredientCreated,
}: RecipeEditorProps) {
  const { ui } = useLocale();

  const sectionLabel = (section?: InventorySection, kind?: string) => {
    if (kind === 'manufactured_internal') return ui('خامة مصنعة');
    if (section === 'serving_packaging') return ui('مستلزم تقديم');
    if (section === 'preparation_ingredients') return ui('خامة تحضير');
    if (section === 'ready_products') return ui('إضافة من منتج جاهز');
    return ui('عنصر مخزون');
  };

  const addLine = () => {
    onChange([...recipes, { ingredientId: 0, quantity: 1, unit: 'piece' }]);
  };

  const updateLine = (index: number, patch: Partial<RecipeLine>) => {
    const next = [...recipes];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeLine = (index: number) => {
    onChange(recipes.filter((_, i) => i !== index));
  };

  const addCreatedIngredient = (material: ProductListItem) => {
    onIngredientCreated?.(material);
    onChange([
      ...recipes,
      {
        ingredientId: material.id,
        quantity: 1,
        unit: defaultCafeRecipeUnit(material.unitOfMeasure),
      },
    ]);
  };

  // Some legacy inventory responses serialise numeric ids as strings. Normalising here keeps
  // the selected material and its default unit in sync instead of falling back to "piece".
  const findIngredient = (id: number) => ingredientOptions.find((i) => Number(i.id) === Number(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{ui('مكونات الوصفة')}</Label>
        <div className="flex flex-wrap gap-2">
          <Button permissionAction={null} type="button" variant="outline" size="sm" onClick={addLine} disabled={disabled}>
            <Plus className="me-1 size-4" />
            {ui('إضافة مكون / Addition')}
          </Button>
          <InlineRawMaterialDialog
            disabled={disabled}
            onCreated={addCreatedIngredient}
            createdMessage={ui('تم حفظ الخامة وإضافتها إلى مكونات الوصفة')}
          />
        </div>
      </div>

      {recipes.length === 0 && (
        <p className="text-sm text-muted-foreground">{ui('لا توجد مكونات مضافة')}</p>
      )}

      <div className="space-y-3">
        {recipes.map((line, idx) => {
          const ingredient = findIngredient(line.ingredientId);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 items-start gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-5">
                <Label className="mb-1.5 block text-xs text-muted-foreground">{ui('الصنف من المخزن')}</Label>
                <IngredientCombobox
                  value={line.ingredientId ? String(line.ingredientId) : ''}
                  onValueChange={(v) => {
                    const id = Number(v);
                    const selected = findIngredient(id);
                    updateLine(idx, {
                      ingredientId: id,
                      unit: defaultCafeRecipeUnit(selected?.unitOfMeasure ?? 'piece'),
                    });
                  }}
                  options={ingredientOptions}
                  placeholder={ui('اختر عنصر المخزون')}
                  disabled={disabled}
                />
              </div>

              <div className="sm:col-span-3">
                <Label className="mb-1.5 block text-xs text-muted-foreground">
                  {ingredient?.inventoryKind === 'ready_product'
                    ? ui('كمية الإضافة لكل طلب')
                    : ui('كمية المكون لكل طلب')}
                </Label>
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  className="nums text-end"
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                  placeholder={ui('الكمية')}
                  disabled={disabled}
                />
              </div>

              <div className="sm:col-span-3">
                <Label className="mb-1.5 block text-xs text-muted-foreground">{ui('وحدة الكمية')}</Label>
                <Select
                  key={line.ingredientId || 'no-ingredient'}
                  value={line.unit}
                  onValueChange={(v) => updateLine(idx, { unit: v as RecipeUnit })}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={ui('الوحدة')} />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleCafeUnitOptions(ingredient?.unitOfMeasure ?? line.unit).map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => removeLine(idx)}
                  disabled={disabled}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {ingredient && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/45 px-3 py-2 text-xs text-muted-foreground sm:col-span-12">
                  <span>{ui('وحدة المخزون الأساسية:')} {cafeUnitLabel(ingredient.unitOfMeasure)}</span>
                  <span>{ui('النوع')}: {sectionLabel(ingredient.inventorySection, ingredient.inventoryKind)}</span>
                  {(() => {
                    const converted = convertCafeUnit(line.quantity, line.unit, ingredient.unitOfMeasure);
                    if (converted == null) return <span className="text-destructive">{ui('الوحدة غير متوافقة')}</span>;
                    return (
                      <>
                        <span className="nums">{ui('سيُخصم من المخزون')}: {converted.toFixed(3)} {ingredient.unitOfMeasure}</span>
                        <span className="nums">{ui('تكلفة المكون')}: {((ingredient.costPrice ?? 0) * converted).toFixed(2)}</span>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
