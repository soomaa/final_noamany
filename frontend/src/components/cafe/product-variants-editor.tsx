import { ChefHat, Copy, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [recipeDialogIndex, setRecipeDialogIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!variants.length) {
      setRecipeDialogIndex(null);
      return;
    }
    if (recipeDialogIndex != null && recipeDialogIndex >= variants.length) {
      setRecipeDialogIndex(null);
    }
  }, [recipeDialogIndex, variants.length]);

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
    setRecipeDialogIndex(variants.length);
  };

  const removeVariant = (index: number) => {
    const next = variants.filter((_, current) => current !== index);
    if (variants[index]?.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
    onChange(next);
    if (recipeDialogIndex === index) setRecipeDialogIndex(null);
    else if (recipeDialogIndex != null && recipeDialogIndex > index) setRecipeDialogIndex(recipeDialogIndex - 1);
  };

  const recipeCost = (recipes: RecipeLine[]) => recipes.reduce((total, recipe) => {
    const ingredient = ingredientOptions.find((row) => row.id === recipe.ingredientId);
    if (!ingredient) return total;
    const converted = convertCafeUnit(recipe.quantity, recipe.unit, ingredient.unitOfMeasure);
    return total + (converted == null ? 0 : converted * (ingredient.costPrice ?? 0));
  }, 0);
  const recipeVariant = recipeDialogIndex == null ? null : variants[recipeDialogIndex] ?? null;

  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{ui('الأحجام والأنواع')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui('كل اختيار له سعر ووصفة مستقلة، وسيظهر كاختيار منظم في نقطة البيع.')}
          </p>
        </div>
        <Button permissionAction={null} type="button" variant="outline" size="sm" onClick={addVariant} disabled={disabled}>
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

                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
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
                  </div>
                  <Button
                    permissionAction={null}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="justify-self-center px-5"
                    onClick={() => setRecipeDialogIndex(index)}
                    disabled={disabled}
                  >
                    <ChefHat className="me-1 size-4" />
                    {ui('تعديل وصفة الحجم')}
                  </Button>
                  <div className="flex sm:justify-end">
                    <Button permissionAction={null} type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removeVariant(index)} disabled={disabled || variants.length === 1}>
                      <Trash2 className="me-1 size-4" />{ui('حذف الاختيار')}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={recipeDialogIndex != null} onOpenChange={(open) => { if (!open) setRecipeDialogIndex(null); }}>
        <DialogContent size="lg" className="h-[min(86vh,820px)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{ui('تعديل وصفة الحجم')}{recipeVariant ? ` — ${recipeVariant.name || ui('حجم أو نوع جديد')}` : ''}</DialogTitle>
            <DialogDescription>{ui('حدد سعر البيع ثم أضف مقادير هذا الحجم.')}</DialogDescription>
          </DialogHeader>

          {recipeVariant && recipeDialogIndex != null ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">{ui('اسم الحجم أو النوع')}</p>
                  <p className="mt-1 font-bold">{recipeVariant.name || ui('حجم أو نوع جديد')}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-muted-foreground">{ui('التكلفة المحسوبة')}</p>
                  <p className="nums mt-1 text-lg font-black text-primary">{recipeCost(recipeVariant.recipes).toFixed(2)} {ui('ج.م')}</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                <RecipeEditor
                  recipes={recipeVariant.recipes}
                  onChange={(recipes) => update(recipeDialogIndex, { recipes })}
                  ingredientOptions={ingredientOptions}
                  disabled={disabled}
                  onIngredientCreated={onIngredientCreated}
                />
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setRecipeDialogIndex(null)}>{ui('تم')}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
