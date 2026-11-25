import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useArrayResource } from '@/lib/api-hooks';
import { formatMoney } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export type GroupPlanDraft = { key: string; subscriptionTypeId: string; discountType: 'percentage' | 'fixed'; discountValue: string };

type PackageOption = { id: number; name: string; price: number; isActive?: boolean };

let nextKey = 0;
export const newGroupPlanDraft = (): GroupPlanDraft => ({ key: `plan-${(nextKey += 1)}`, subscriptionTypeId: '', discountType: 'percentage', discountValue: '' });

/** Problem with the package list, in the active language, or null when it can be saved. */
export function groupPlansError(plans: GroupPlanDraft[], text: (ar: string, en: string) => string): string | null {
  const chosen = plans.filter((plan) => plan.subscriptionTypeId);
  if (!chosen.length) return text('اختر باقة واحدة على الأقل وحدد خصمها.', 'Choose at least one package and its discount.');
  if (chosen.length !== plans.length) return text('اختر الباقة في كل سطر أو احذف السطر الفارغ.', 'Pick a package in every row or remove the empty row.');
  if (new Set(chosen.map((plan) => plan.subscriptionTypeId)).size !== chosen.length) return text('كل باقة تُضاف مرة واحدة فقط.', 'Each package can be added once.');
  for (const plan of chosen) {
    const value = Number(plan.discountValue);
    if (!Number.isFinite(value) || value <= 0) return text('اكتب خصمًا أكبر من صفر لكل باقة.', 'Enter a discount above zero for every package.');
    if (plan.discountType === 'percentage' && value > 100) return text('النسبة لا تتجاوز 100%.', 'Percentages cannot exceed 100%.');
  }
  return null;
}

/** «الباقات المتاحة للمجموعة»: one row per package with a «نسبة % | مبلغ» toggle and its value. */
export function MemberGroupPlansEditor({ plans, onChange }: { plans: GroupPlanDraft[]; onChange: (plans: GroupPlanDraft[]) => void }) {
  const { locale } = useLocale();
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const { data: packages = [], isLoading } = useArrayResource<PackageOption>('club-subscription-types');
  const options = packages.filter((pkg) => pkg.isActive !== false);
  const update = (key: string, patch: Partial<GroupPlanDraft>) => onChange(plans.map((plan) => (plan.key === key ? { ...plan, ...patch } : plan)));
  const currency = locale === 'ar' ? 'ج.م' : 'EGP';

  return (
    <div className="space-y-3">
      {plans.map((plan, index) => {
        const pkg = options.find((option) => String(option.id) === plan.subscriptionTypeId);
        const value = Number(plan.discountValue) || 0;
        const net = pkg ? Math.max(0, pkg.price - (plan.discountType === 'percentage' ? (pkg.price * value) / 100 : value)) : null;
        const taken = new Set(plans.filter((other) => other.key !== plan.key).map((other) => other.subscriptionTypeId));
        return (
          <div key={plan.key} className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto_7.5rem_auto] sm:items-end">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{text(`الباقة ${index + 1}`, `Package ${index + 1}`)}</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={plan.subscriptionTypeId}
                onChange={(event) => update(plan.key, { subscriptionTypeId: event.target.value })}
                disabled={isLoading}
              >
                <option value="">{isLoading ? text('جارٍ التحميل…', 'Loading…') : text('اختر الباقة', 'Choose package')}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id} disabled={taken.has(String(option.id))}>
                    {option.name} — {formatMoney(option.price)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{text('نوع الخصم', 'Discount type')}</span>
              <div role="radiogroup" aria-label={text('نوع الخصم', 'Discount type')} className="inline-flex h-10 overflow-hidden rounded-md border">
                {([['percentage', text('نسبة %', 'Percent %')], ['fixed', text(`مبلغ ${currency}`, `Amount ${currency}`)]] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={plan.discountType === type}
                    onClick={() => update(plan.key, { discountType: type })}
                    className={cn('min-w-[4.75rem] px-3 text-sm transition-colors', plan.discountType === type ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{plan.discountType === 'percentage' ? text('النسبة', 'Percent') : text('قيمة الخصم', 'Discount')}</span>
              <Input
                className="nums"
                type="number"
                inputMode="decimal"
                min={0.01}
                max={plan.discountType === 'percentage' ? 100 : pkg?.price}
                step="0.01"
                value={plan.discountValue}
                onChange={(event) => update(plan.key, { discountValue: event.target.value })}
              />
            </label>
            <Button type="button" variant="ghost" size="icon" className="justify-self-end text-destructive" aria-label={text('حذف الباقة', 'Remove package')} onClick={() => onChange(plans.filter((other) => other.key !== plan.key))}>
              <Trash2 className="size-4" />
            </Button>
            {net != null && value > 0 ? (
              <p className="text-xs text-muted-foreground sm:col-span-4">
                {text('السعر للعضو بعد الخصم', 'Member price after discount')}: <b className="nums text-foreground">{formatMoney(net)}</b>
              </p>
            ) : null}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...plans, newGroupPlanDraft()])}>
        <Plus className="size-4" /> {text('إضافة باقة', 'Add package')}
      </Button>
    </div>
  );
}
