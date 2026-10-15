import { FieldWrapper } from '@/components/common/form-fields';
import {
  SubscriptionDiscountFields,
  type SubscriptionDiscountMode,
} from '@/components/club/subscription-discount-fields';
import { useClubT } from '@/hooks/use-club-t';
import { useArrayResource } from '@/lib/api-hooks';
import { formatMoney } from '@/lib/formatters';
import type { ClubDiscountCode } from '@/types/club';

export type PlanTransferDiscount = {
  mode: SubscriptionDiscountMode;
  codeId: string;
  fixedValue: string;
};

export const NO_PLAN_TRANSFER_DISCOUNT: PlanTransferDiscount = { mode: 'none', codeId: '', fixedValue: '' };

/** Request fields for `/club-subscription-transfers` (preview and create). */
export function planTransferDiscountBody(discount: PlanTransferDiscount) {
  if (discount.mode === 'code' && discount.codeId) return { discountCodeId: Number(discount.codeId) };
  if (discount.mode === 'fixed') {
    return { discountEnabled: true, discountValue: Math.max(0, Number(discount.fixedValue) || 0) };
  }
  return {};
}

/** Discount on the new plan of a plan transfer — it only lowers the difference still to collect. */
export function PlanTransferDiscountFields({
  open,
  grossValue,
  value,
  appliedDiscount,
  requestedDiscount,
  disabled,
  onChange,
}: {
  open: boolean;
  grossValue: number;
  value: PlanTransferDiscount;
  appliedDiscount?: number;
  requestedDiscount?: number;
  disabled?: boolean;
  onChange: (next: PlanTransferDiscount) => void;
}) {
  const ct = useClubT();
  const { data: codes = [] } = useArrayResource<ClubDiscountCode>('club-discount-codes', open);
  const capped = requestedDiscount != null && appliedDiscount != null && requestedDiscount > appliedDiscount + 0.009;

  return (
    <FieldWrapper label={ct('subscriptions.transferDiscount')} hint={ct('subscriptions.transferDiscountHint')}>
      <SubscriptionDiscountFields
        grossValue={grossValue}
        codes={codes}
        mode={value.mode}
        codeId={value.codeId}
        fixedValue={value.fixedValue}
        showSummary={false}
        disabled={disabled}
        onChange={onChange}
      />
      {capped ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="status">
          {ct('subscriptions.transferDiscountCapped', { amount: formatMoney(appliedDiscount ?? 0) })}
        </p>
      ) : null}
    </FieldWrapper>
  );
}
