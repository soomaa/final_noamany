import { useQuery } from '@tanstack/react-query';
import { formatDisplayNumber } from '@/lib/number-display';
import { CalendarClock, CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DialogFormGrid,
  DialogFormSection,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import {
  buildClubPaymentSplit,
  ClubPaymentSplitFields,
  singlePaymentRow,
  splitRowsTotal,
  type ClubPaymentSplitRow,
} from '@/components/club/club-payment-split-fields';
import {
  SubscriptionDiscountFields,
  type SubscriptionDiscountMode,
} from '@/components/club/subscription-discount-fields';
import { useClubT } from '@/hooks/use-club-t';
import { RenewalPromotionSelect } from '@/components/club/renewal-promotion-select';
import { sameRenewalSelection } from '@/lib/renewal-promotions';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { formatMoney } from '@/lib/formatters';
import { canConfirmSubscriptionRenewal } from '@/lib/subscription-action-access';
import type {
  SubscriptionRenewalQuote,
  SubscriptionRenewalStartMode,
} from '@/lib/subscription-renewal';
import { cn, toArabicDigits } from '@/lib/utils';
import type {
  ClubDiscountCode,
  ClubSubscriptionListItem,
} from '@/types/club';

type RenewalBody = {
  privateTrainerId?: number;
  promotionTypeId?: number;
  discountEnabled?: boolean;
  discountCodeId?: number;
  discountValue?: number;
  paidAmount?: number;
  paymentMethod?: string;
  payments?: { method: string; amount: number }[];
  quoteVersion?: string;
  startMode?: SubscriptionRenewalStartMode;
};

export function SubscriptionRenewalDialog({
  source,
  open,
  onOpenChange,
  onSuccess,
}: {
  source: ClubSubscriptionListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: {
    subscription: ClubSubscriptionListItem;
    quote: SubscriptionRenewalQuote;
    payments: ClubPaymentSplitRow[];
  }) => void;
}) {
  const ct = useClubT();
  const { can } = usePermission();
  const canConfirmRenewal = canConfirmSubscriptionRenewal(can);
  const { data: discountCodes = [] } = useArrayResource<ClubDiscountCode>(
    'club-discount-codes',
    open,
  );
  const [promotionTypeId, setPromotionTypeId] = useState('');
  const [discountMode, setDiscountMode] = useState<SubscriptionDiscountMode>('none');
  const [discountCodeId, setDiscountCodeId] = useState('');
  const [fixedDiscount, setFixedDiscount] = useState('');
  const [startMode, setStartMode] = useState<SubscriptionRenewalStartMode>('extend');
  const [paymentRows, setPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [quote, setQuote] = useState<SubscriptionRenewalQuote | null>(null);
  // The discount selection the current quote was priced for. A quote for an older selection
  // must never be confirmed — the operator would see one net value and be charged another.
  const [quotedDiscountKey, setQuotedDiscountKey] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [trainerOverride, setTrainerOverride] = useState('');
  const { data: renewalTrainers = [], isLoading: trainersLoading, isError: trainersError, refetch: retryTrainers } = useQuery({
    queryKey: ['club-trainers', 'renewal'],
    queryFn: async () => (await api.get<{ data: { id: number; name: string }[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
    enabled: open && !!source?.privatePackageId,
  });
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultPaymentPending = useRef(true);

  const discountBody = useMemo<RenewalBody>(() => {
    const promotion = promotionTypeId ? { promotionTypeId: Number(promotionTypeId) } : {};
    if (discountMode === 'code' && discountCodeId) {
      return { ...promotion, discountCodeId: Number(discountCodeId), startMode, privateTrainerId: trainerOverride ? Number(trainerOverride) : undefined };
    }
    if (discountMode === 'fixed') {
      return { ...promotion,
        discountEnabled: true,
        discountValue: Math.max(0, Number(fixedDiscount) || 0),
        startMode,
        privateTrainerId: trainerOverride ? Number(trainerOverride) : undefined,
      };
    }
    return { ...promotion, discountEnabled: false, startMode, privateTrainerId: trainerOverride ? Number(trainerOverride) : undefined };
  }, [discountCodeId, discountMode, fixedDiscount, trainerOverride, startMode, promotionTypeId]);
  const discountKey = JSON.stringify(discountBody);
  const codeMissing = discountMode === 'code' && !discountCodeId;
  const quoteReady = !!quote && quote.sourceSubscriptionId === source?.id
    && quotedDiscountKey === discountKey && !quoteLoading && !quoteError;

  useEffect(() => {
    if (!open) return;
    setPromotionTypeId('');
    setDiscountMode('none');
    setDiscountCodeId('');
    setFixedDiscount('');
    setStartMode('extend');
    setTrainerOverride('');
    setPaymentRows(singlePaymentRow('cash'));
    setQuote(null);
    setQuotedDiscountKey('');
    setQuoteError('');
    defaultPaymentPending.current = true;
  }, [open, source?.id]);

  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const { data } = await api.post<SubscriptionRenewalQuote>(
          `/club-subscriptions/${source.id}/renew/quote`,
          { ...discountBody, paidAmount: 0 },
        );
        if (cancelled) return;
        setQuote(data);
        setQuotedDiscountKey(discountKey);
        const currentPaid = splitRowsTotal(paymentRows);
        if (defaultPaymentPending.current || currentPaid > data.netValue) {
          setPaymentRows(singlePaymentRow(paymentRows[0]?.method ?? 'cash', data.netValue));
          defaultPaymentPending.current = false;
        }
      } catch (error) {
        if (!cancelled) setQuoteError(apiError(error));
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [discountBody, discountKey, open, source, quoteRetry]);

  const paidAmount = splitRowsTotal(paymentRows);
  const remainingAmount = Math.max(0, (quote?.netValue ?? 0) - paidAmount);
  const scheduleText = quote
    ? quote.scheduleMode === 'from_today'
      ? ct('subscriptions.renewStartsFromToday')
      : quote.scheduleMode === 'immediate'
      ? ct('subscriptions.renewStartsNow')
      : quote.scheduleMode === 'after_queue'
        ? ct('subscriptions.renewStartsAfterQueue')
        : ct('subscriptions.renewStartsAfterCurrent')
    : '';
  const actionText = quote
    ? quote.scheduleMode === 'immediate' || quote.scheduleMode === 'from_today'
      ? ct('subscriptions.renewActionNow')
      : quote.scheduleMode === 'after_queue'
        ? ct('subscriptions.renewActionQueue')
        : ct('subscriptions.renewActionSchedule')
    : ct('subscriptions.renew');

  const submit = async () => {
    if (!source || !quote || !quoteReady || codeMissing) return;
    if (paidAmount < 0 || paidAmount > quote.netValue) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    const split = buildClubPaymentSplit(paymentRows, paidAmount, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    const paymentBody: RenewalBody = paidAmount > 0
      ? { paidAmount, ...split.payload }
      : { paidAmount: 0 };

    setSubmitting(true);
    try {
      const { data: confirmedQuote } = await api.post<SubscriptionRenewalQuote>(
        `/club-subscriptions/${source.id}/renew/quote`,
        { ...discountBody, ...paymentBody },
      );
      if (!sameRenewalSelection(quote, confirmedQuote) || quote.privateTrainerId !== confirmedQuote.privateTrainerId || JSON.stringify(quote.purchasedBenefits) !== JSON.stringify(confirmedQuote.purchasedBenefits)) {
        setQuote(confirmedQuote);
        toast.error(ct('subscriptions.renewQuoteChanged'));
        return;
      }
      const { data } = await api.patch<{
        subscription: ClubSubscriptionListItem;
        quote: SubscriptionRenewalQuote;
      }>(`/club-subscriptions/${source.id}/renew`, {
        ...discountBody,
        ...paymentBody,
        quoteVersion: confirmedQuote.quoteVersion,
      });
      onSuccess({ ...data, payments: paymentRows });
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(FORM_DIALOG_CONTENT_CLASS, 'sm:max-w-[min(94vw,48rem)]')}
      >
        <FormDialogHeader>
          <DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle>
          <DialogDescription>{ct('subscriptions.renewAutomaticHint')}</DialogDescription>
        </FormDialogHeader>

        <FormDialogBody>
          {source?.privatePackageId && <FieldWrapper label={ct('subscriptions.renewTrainer')}>
            <select aria-label={ct('subscriptions.renewTrainer')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={trainerOverride} disabled={submitting || trainersLoading || trainersError} onChange={event => setTrainerOverride(event.target.value)}>
              <option value="">{ct('subscriptions.renewKeepTrainer')}</option>
              {renewalTrainers.map(trainer => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{ct('subscriptions.renewTrainerHint')}</p>
            {trainersLoading && <p role="status">{ct('common.loading')}</p>}
            {trainersError && <div role="alert"><p>{ct('subscriptions.trainerLoadError')}</p><Button type="button" variant="outline" onClick={() => void retryTrainers()}>{ct('common.retry')}</Button></div>}
          </FieldWrapper>}

          <RenewalPromotionSelect
            source={source}
            open={open}
            value={promotionTypeId}
            disabled={submitting}
            onChange={(value) => {
              defaultPaymentPending.current = true;
              setQuote(null);
              setPromotionTypeId(value);
            }}
          />
          {quoteLoading && !quote ? (
            <div className="space-y-4" aria-label={ct('common.loading')}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : quoteError && !quote ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{ct('subscriptions.renewUnavailable')}</p>
                  <p className="mt-1 leading-relaxed">{quoteError}</p>
                  <Button type="button" variant="outline" onClick={() => setQuoteRetry(value => value + 1)}>{ct('common.retry')}</Button>
                </div>
              </div>
            </div>
          ) : quote ? (
            <>
              {quoteError ? (
                <div
                  className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold">{ct('subscriptions.renewUnavailable')}</p>
                      <p className="mt-1 leading-relaxed">{quoteError}</p>
                  <Button type="button" variant="outline" onClick={() => setQuoteRetry(value => value + 1)}>{ct('common.retry')}</Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <DialogFormSection
                title={ct('subscriptions.renewSamePackage')}
                description={ct('subscriptions.renewSamePackageHint')}
                icon={CalendarClock}
              >
                <DialogFormGrid>
                  <FieldWrapper label={ct('subscriptions.subType')}>
                    <div className="min-h-11 rounded-xl border border-border/70 bg-muted/30 px-4 py-3" role="status">
                      <p className="font-semibold text-foreground">{quote.subscriptionType}</p>
                      {quote.sessionsCount != null ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {toArabicDigits(quote.sessionsCount)} {ct('subscriptions.typeSessions')}
                        </p>
                      ) : null}
                    </div>
                  </FieldWrapper>
                  <FieldWrapper label={ct('subscriptions.currentPackagePrice')}>
                    <div className="flex min-h-11 items-center rounded-xl border border-border/70 bg-muted/30 px-4 py-3 font-semibold nums">
                      {formatMoney(quote.grossValue)}
                    </div>
                  </FieldWrapper>
                </DialogFormGrid>

                {quote.purchasedBenefits && <div className="space-y-2 text-sm" aria-live="polite">
                  <p className="font-medium">{ct('subscriptions.renewBenefits')}</p>
                  <p>{ct('subscriptions.renewWellness', { inbody: Number(quote.purchasedBenefits.inbody_count ?? 0), spa: quote.purchasedBenefits.includes_spa ? Number(quote.purchasedBenefits.spa_count ?? 0) : 0 })}</p>
                  <p>{quote.purchasedBenefits.is_linked_to_freeze
                    ? ct('subscriptions.freezeBalance', { days: Number.isFinite(quote.purchasedBenefits.freeze_total_days) ? Number(quote.purchasedBenefits.freeze_total_days) : ct('subscriptions.unlimited'), times: Number.isFinite(quote.purchasedBenefits.freeze_days) ? Number(quote.purchasedBenefits.freeze_days) : ct('subscriptions.unlimited') })
                    : ct('subscriptions.renewNoFreeze')}</p>
                  {Number(quote.purchasedBenefits.min_freeze ?? 0) > 0 && <p>{ct('subscriptions.freezeMinimum', { days: Number(quote.purchasedBenefits.min_freeze) })}</p>}
                  {Array.isArray(quote.purchasedBenefits.classTypeNames) && quote.purchasedBenefits.classTypeNames.length > 0 && <p>{ct('subscriptions.renewClasses')}: {quote.purchasedBenefits.classTypeNames.join('، ')}</p>}
                </div>}

                {quote.canStartToday ? (
                  <FieldWrapper label={ct('subscriptions.renewStartChoice')}>
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={ct('subscriptions.renewStartChoice')}>
                      {(['extend', 'today'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={startMode === mode}
                          disabled={submitting}
                          onClick={() => setStartMode(mode)}
                          className={cn(
                            'rounded-xl border px-4 py-3 text-start transition-colors disabled:opacity-60',
                            startMode === mode
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                              : 'border-border/70 bg-background hover:bg-muted/40',
                          )}
                        >
                          <p className="font-semibold text-foreground">
                            {ct(mode === 'extend' ? 'subscriptions.renewModeExtend' : 'subscriptions.renewModeToday')}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {ct(mode === 'extend' ? 'subscriptions.renewModeExtendHint' : 'subscriptions.renewModeTodayHint')}
                          </p>
                        </button>
                      ))}
                    </div>
                  </FieldWrapper>
                ) : null}

                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-foreground">{scheduleText}</p>
                    <p className="mt-1 text-muted-foreground">
                      <span className="nums">{toArabicDigits(quote.startDate)}</span>
                      {' — '}
                      <span className="nums">{toArabicDigits(quote.endDate)}</span>
                    </p>
                    {quote.scheduleMode === 'from_today' && (quote.forfeitedDays || quote.forfeitedSessions) ? (
                      <p className="mt-2 text-amber-700 dark:text-amber-300">
                        {ct('subscriptions.renewForfeitNotice', {
                          remaining: quote.forfeitedSessions != null
                            ? `${toArabicDigits(quote.forfeitedSessions)} ${ct('subscriptions.renewSessionsUnit')}`
                            : `${toArabicDigits(quote.forfeitedDays ?? 0)} ${ct('subscriptions.renewDaysUnit')}`,
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>

                {quote.currentOutstandingAmount > 0 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-amber-950 dark:text-amber-100">
                    <CircleAlert className="mt-0.5 size-5 shrink-0" />
                    <p className="text-sm leading-relaxed">
                      {ct('subscriptions.renewOldDebtNotice')}:{' '}
                      <b className="nums">{formatMoney(quote.currentOutstandingAmount)}</b>
                    </p>
                  </div>
                ) : null}
              </DialogFormSection>

              <DialogFormSection
                title={ct('subscriptions.renewDiscountTitle')}
                description={ct('subscriptions.renewDiscountHint')}
              >
                <SubscriptionDiscountFields
                  grossValue={quote.grossValue}
                  codes={discountCodes}
                  mode={discountMode}
                  codeId={discountCodeId}
                  fixedValue={fixedDiscount}
                  showSummary={false}
                  disabled={submitting}
                  onChange={(next) => {
                    setDiscountMode(next.mode);
                    setDiscountCodeId(next.codeId);
                    setFixedDiscount(next.fixedValue);
                  }}
                />
                {codeMissing ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">
                    {ct('subscriptions.renewSelectDiscountCode')}
                  </p>
                ) : null}
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background" aria-live="polite" aria-busy={!quoteReady}>
                  {quoteReady ? (
                    <>
                      <div className="space-y-3 p-4 text-sm sm:p-5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">{ct('subscriptions.currentPackagePrice')}</span>
                          <span className="nums font-semibold">{formatMoney(quote.grossValue)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="min-w-0 text-muted-foreground">
                            {ct('subscriptions.discountValue')}
                            {quote.discountCodeId && quote.discountPercentage != null ? (
                              <span className="ms-1 text-xs">({discountCodes.find((code) => code.id === quote.discountCodeId)?.code} · {formatDisplayNumber(quote.discountPercentage)}%)</span>
                            ) : null}
                          </span>
                          <span className={cn('nums font-semibold', quote.discountValue > 0 && 'text-emerald-700 dark:text-emerald-300')}>
                            {quote.discountValue > 0 ? '− ' : ''}{formatMoney(quote.discountValue)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-primary/20 bg-primary/[0.07] px-4 py-4 sm:px-5">
                        <span className="font-semibold">{ct('subscriptions.netValue')}</span>
                        <strong className="nums text-xl text-foreground dark:text-primary">{formatMoney(quote.netValue)}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3 p-4" aria-label={ct('common.loading')}>
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )}
                </div>
              </DialogFormSection>

              <DialogFormSection
                title={ct('subscriptions.sectionPayment')}
                description={ct('subscriptions.renewPaymentHint')}
              >
                {quoteReady ? (
                  <div className="grid gap-3 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-2" aria-live="polite">
                    <div className="rounded-lg bg-emerald-500/[0.08] px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground">{ct('subscriptions.paid')}</p>
                      <p className="nums mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(paidAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-500/[0.08] px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground">{ct('subscriptions.remaining')}</p>
                      <p className="nums mt-1 text-lg font-semibold text-amber-700 dark:text-amber-300">{formatMoney(remainingAmount)}</p>
                    </div>
                  </div>
                ) : <Skeleton className="h-24 w-full" />}
                <ClubPaymentSplitFields
                  className="mt-5"
                  total={quote.netValue}
                  rows={paymentRows}
                  onChange={setPaymentRows}
                  disabled={submitting || !quoteReady}
                />
              </DialogFormSection>
            </>
          ) : null}
        </FormDialogBody>

        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {ct('common.cancel')}
          </Button>
          {canConfirmRenewal ? (
            <Button
              type="button"
              variant="brand"
              permissionAction={null}
              onClick={() => void submit()}
              disabled={!quoteReady || codeMissing || submitting}
            >
              <RefreshCw className={cn('size-4', submitting && 'animate-spin')} />
              {submitting ? ct('common.saving') : actionText}
            </Button>
          ) : null}
        </FormDialogFooter>
      </DialogContent>
    </Dialog>
  );
}
