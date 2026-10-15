import { useClubT } from '@/hooks/use-club-t';
import { useArrayResource } from '@/lib/api-hooks';
import { formatDate, formatMoney } from '@/lib/formatters';
import { liveRenewalPromotions } from '@/lib/renewal-promotions';
import { toArabicDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ClubSubscriptionListItem, ClubSubscriptionType } from '@/types/club';

export function RenewalPromotionSelect({ source, open, value, disabled, onChange }: {
  source: ClubSubscriptionListItem | null;
  open: boolean;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const ct = useClubT();
  const eligible = !!source?.subscriptionTypeId && !source.specialClassTypeId && !source.privatePackageId;
  const { data: types = [], isLoading, isError, refetch } = useArrayResource<ClubSubscriptionType>(
    `club-subscription-types?branchId=${source?.branchId ?? ''}`,
    open && eligible,
  );
  if (!eligible) return null;
  const offers = liveRenewalPromotions(types, !!source?.isLinkedToSessions);
  const selected = offers.find((offer) => String(offer.id) === value);

  return (
    <div className="space-y-2">
      <label htmlFor="renewal-promotion" className="text-sm font-semibold">{ct('subscriptions.renewPromotionLabel')}</label>
      <select
        id="renewal-promotion"
        aria-describedby="renewal-promotion-hint"
        className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        value={value}
        disabled={disabled || isLoading}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{ct('subscriptions.renewRegularPackage')}</option>
        {value && !selected && <option value={value} disabled>{ct('subscriptions.renewPromotionUnavailable')}</option>}
        {offers.map((offer) => (
          <option key={offer.id} value={String(offer.id)}>
            {offer.name} — {formatMoney(offer.promoPrice ?? 0)} — {ct('subscriptions.renewPromotionDays', { days: toArabicDigits(offer.days > 0 ? offer.days : offer.isLinkedToSessions ? 30 : 0) })}
          </option>
        ))}
      </select>
      <p id="renewal-promotion-hint" className="text-sm text-muted-foreground">
        {isLoading ? ct('common.loading') : ct('subscriptions.renewPromotionHint')}
      </p>
      {selected?.promoEndsAt && <p className="text-sm text-muted-foreground">{ct('subscriptions.renewPromotionEnds', { date: formatDate(selected.promoEndsAt, 'yyyy/MM/dd HH:mm') })}</p>}
      {!isLoading && !isError && offers.length === 0 && <p className="text-sm text-muted-foreground">{ct('subscriptions.renewNoPromotions')}</p>}
      {isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{ct('subscriptions.renewPromotionsLoadError')}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void refetch()}>{ct('subscriptions.renewPromotionsRetry')}</Button>
      </div>}
    </div>
  );
}
