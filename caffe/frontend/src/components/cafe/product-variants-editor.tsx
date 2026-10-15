import { ChevronDown, Copy, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/store/locale';
import { convertCafeUnit } from '@/lib/cafe-units';
import { RecipeEditor, type RecipeIngredientOption, type RecipeLine } from './recipe-editor';
import type { ProductListItem } from '@/types/inventory';

export interface CafeVariantForm {
  id?: number;
  name: string;
  variantCode: string;
  sellPrice: number;
  isDefault: boolean;
  isActive: boolean;
  recipes: RecipeLine[];
}

interface Props {
  variants: CafeVariantForm[];
  onChange: (variants: CafeVariantForm[]) => void;
  ingredientOptions: RecipeIngredientOption[];
  disabled?: boolean;
  onIngredientCreated?: (material: ProductListItem) => void;
}

export function ProductVariantsEditor({
  variants,
  onChange,
  ingredientOptions,
  disabled,
  onIngredientCreated,
}: Props) {
  const { ui } = useLocale();
  const [openIndex, setOpenIndex] = useState<number | null>(variants.length ? 0 : null);

  useEffect(() => {
    if (!variants.length) {
      setOpenIndex(null);
      return;
    }
    if (openIndex != null && openIndex >= variants.length) setOpenIndex(variants.length - 1);
  }, [openIndex, variants.length]);

  const update = (index: number, patch: Partial<CafeVariantForm>) => {
    onChange(variants.map((variant, current) => current === index ? { ...variant, ...patch } : variant));
  };

  const setDefault = (index: number) => {
    onChange(variants.map((variant, current) => ({ ...variant, isDefault: current === index, isActive: current === index ? true : variant.isActive })));
  };

  const addVariant = () => {
    const source = variants.find((variant) => variant.isDefault) ?? variants[0];
    onChange([
      ...variants,
      {
        name: '',
        variantCode: '',
        sellPrice: source?.sellPrice ?? 0,
        isDefault: variants.length === 0,
        isActive: true,
        recipes: source?.recipes.map((recipe) => ({ ...recipe })) ?? [],
      },
    ]);
    setOpenIndex(variants.length);
  };

  const removeVariant = (index: number) => {
    const next = variants.filter((_, current) => current !== index);
    if (variants[index]?.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
    onChange(next);
    if (!next.length) setOpenIndex(null);
    else if (openIndex === index) setOpenIndex(Math.min(index, next.length - 1));
    else if (openIndex != null && openIndex > index) setOpenIndex(openIndex - 1);
  };

  const recipeCost = (recipes: RecipeLine[]) => recipes.reduce((total, recipe) => {
    const ingredient = ingredientOptions.find((row) => row.id === recipe.ingredientId);
    if (!ingredient) return total;
    const converted = convertCafeUnit(recipe.quantity, recipe.unit, ingredient.unitOfMeasure);
    return total + (converted == null ? 0 : converted * (ingredient.costPrice ?? 0));
  }, 0);

  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{ui('الأحجام والأنواع')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui('كل اختيار له سعر ووصفة مستقلة، وسيظهر كاختيار منظم في نقطة البيع.')}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addVariant} disabled={disabled}>
          <Plus className="me-1 size-4" />{ui('إضافة حجم أو نوع')}
        </Button>
      </div>

      {!variants.length ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {ui('أضف أول اختيار، مثل Regular أو Large أو Single أو Double.')}
        </div>
      ) : null}

      <div className="space-y-3">
        {variants.map((variant, index) => {
          const cost = recipeCost(variant.recipes);
          const profit = variant.sellPrice - cost;
          const margin = variant.sellPrice > 0 ? (profit / variant.sellPrice) * 100 : 0;
          const isOpen = openIndex === index;
          return (
            <article
              key={variant.id ?? `new-${index}`}
              className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${variant.isDefault ? 'border-primary/50 ring-1 ring-primary/10' : ''}`}
            >
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{index + 1}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold">{variant.name || ui('حجم أو نوع جديد')}</h4>
                        {variant.isDefault ? <Badge>{ui('الاختيار الافتراضي')}</Badge> : null}
                        {!variant.isActive ? <Badge variant="outline">{ui('معطل')}</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ui('حدد سعر البيع ثم أضف مقادير هذا الحجم.')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                    <Switch id={`variant-active-${index}`} checked={variant.isActive} onCheckedChange={(checked) => update(index, { isActive: checked })} disabled={disabled || variant.isDefault} />
                    <Label htmlFor={`variant-active-${index}`} className="text-xs">{ui('متاح للبيع')}</Label>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`variant-name-${index}`}>{ui('اسم الحجم أو النوع')}</Label>
                    <Input id={`variant-name-${index}`} value={variant.name} onChange={(event) => update(index, { name: event.target.value })} placeholder={ui('مثال: Large أو Double')} disabled={disabled} />
                  </div>
                  <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
                    <Label htmlFor={`variant-price-${index}`} className="font-bold text-primary">{ui('سعر بيع هذا الحجم')}</Label>
                    <Input id={`variant-price-${index}`} dir="ltr" inputMode="decimal" className="nums h-11 text-end text-lg font-black" type="number" min={0.01} step={0.01} value={variant.sellPrice} onChange={(event) => update(index, { sellPrice: Number(event.target.value) })} placeholder={ui('أدخل سعر البيع')} required disabled={disabled} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/20 p-2 text-center">
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">{ui('التكلفة المحسوبة')}</p>
                    <p className="nums mt-1 font-bold">{cost.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">{ui('الربح')}</p>
                    <p className={`nums mt-1 font-bold ${profit < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{profit.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">{ui('هامش الربح')}</p>
                    <p className={`nums mt-1 font-bold ${margin < 0 ? 'text-destructive' : 'text-primary'}`}>{margin.toFixed(2)}%</p>
                  </div>
                </div>

                {variant.sellPrice > 0 && profit < 0 ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    {ui('سعر بيع هذا الحجم أقل من تكلفة مكوناته. ارفع السعر أو راجع الوصفة.')}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={variant.isDefault ? 'default' : 'outline'} onClick={() => setDefault(index)} disabled={disabled}>
                    <Star className={`me-1 size-4 ${variant.isDefault ? 'fill-current' : ''}`} />{variant.isDefault ? ui('الاختيار الافتراضي') : ui('تعيين كافتراضي')}
                  </Button>
                  {variants.some((row) => row.isDefault && row !== variant) ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      const source = variants.find((row) => row.isDefault);
                      if (source) update(index, { recipes: source.recipes.map((recipe) => ({ ...recipe })) });
                    }} disabled={disabled}>
                      <Copy className="me-1 size-4" />{ui('نسخ وصفة الافتراضي')}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removeVariant(index)} disabled={disabled || variants.length === 1}>
                    <Trash2 className="me-1 size-4" />{ui('حذف الاختيار')}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" className="ms-auto" onClick={() => setOpenIndex(isOpen ? null : index)}>
                    <ChevronDown className={`me-1 size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    {isOpen ? ui('إخفاء وصفة الحجم') : ui('تعديل وصفة الحجم')}
                  </Button>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t bg-muted/10 p-4">
                  <RecipeEditor
                    recipes={variant.recipes}
                    onChange={(recipes) => update(index, { recipes })}
                    ingredientOptions={ingredientOptions}
                    disabled={disabled}
                    onIngredientCreated={onIngredientCreated}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
