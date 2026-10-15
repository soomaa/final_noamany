import { Search, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { useArrayResource } from '@/lib/api-hooks';
import { api, apiError } from '@/lib/api';
import { localToday, formatMoney } from '@/lib/formatters';
import { confirmWithPreview } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionListItem } from '@/types/club';
import type { ClubSearchHit } from '@/types/gym-ops';

interface ClubSearchResult {
  hits: ClubSearchHit[];
  topMatch: ClubSearchHit | null;
}

async function fetchClubSearch(q: string): Promise<ClubSearchResult> {
  const { data } = await api.get<
    ClubSearchHit[] | { hits: ClubSearchHit[]; topMatch?: ClubSearchHit | null }
  >('/club/search', {
    params: { q: q.trim(), withEntitlement: true },
  });
  if (Array.isArray(data)) {
    return { hits: data, topMatch: data[0] ?? null };
  }
  const hits = data.hits ?? [];
  return { hits, topMatch: data.topMatch ?? hits[0] ?? null };
}

interface RefundPreview {
  subscriptionId: number;
  customerName: string | null;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  originalValue: number;
  totalDays?: number;
  consumedDays?: number;
  consumedValue?: number;
  paidAmount?: number;
}

interface RefundRow {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  refundAmount: number;
  remainingDays: number;
  refundDate: string;
  status: string;
}

export function SubscriptionRefundsWorkspace() {
  const ct = useClubT();
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [stopDate, setStopDate] = useState(localToday());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  const { data: searchResult } = useQuery({
    queryKey: ['club-refunds-search', query],
    enabled: query.trim().length >= 2 && selectedMemberId == null,
    queryFn: () => fetchClubSearch(query),
  });

  const { data: member } = useQuery({
    queryKey: ['club-refunds-member', selectedMemberId],
    enabled: selectedMemberId != null,
    queryFn: async () => {
      const { data: m } = await api.get<{ id: number; name: string; memberCode: string }>(
        `/club-members/${selectedMemberId}`,
      );
      return m;
    },
  });

  const { data: subs, refetch: refetchSubs } = useQuery({
    queryKey: ['club-refunds-subs', selectedMemberId],
    enabled: selectedMemberId != null,
    queryFn: async () => {
      const { data: list } = await api.get<{ data: ClubSubscriptionListItem[] }>('/club-subscriptions', {
        params: { memberId: selectedMemberId, pageSize: 50 },
      });
      return list.data.filter((s) => s.status === 'active' && s.paidAmount > 0);
    },
  });

  const { data: refunds, refetch: refetchRefunds } = useArrayResource<RefundRow>('club-subscription-refunds');

  const selectMember = (hit: ClubSearchHit) => {
    setSelectedMemberId(hit.id);
    setQuery(hit.memberCode);
    setSelectedSubId(null);
    setPreview(null);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error(ct('members.enterCode'));
      return;
    }
    setSearching(true);
    try {
      const result = await fetchClubSearch(q);
      if (result.topMatch) {
        selectMember(result.topMatch);
        return;
      }
      if (result.hits[0]) {
        selectMember(result.hits[0]);
        return;
      }
      toast.error(ct('members.noMemberFound'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSearching(false);
    }
  };

  const resetMember = () => {
    setSelectedMemberId(null);
    setSelectedSubId(null);
    setPreview(null);
    setQuery('');
  };

  useEffect(() => {
    if (!selectedSubId || !stopDate) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{ preview?: RefundPreview } & RefundPreview>(
            '/club-subscription-refunds?dryRun=true',
            { subscriptionId: selectedSubId, stopDate },
          );
          const p = (data as { preview?: RefundPreview }).preview ?? data;
          if (p && typeof p === 'object' && 'refundAmount' in p) {
            setPreview(p as RefundPreview);
          }
        } catch (e) {
          setPreview(null);
          toast.error(apiError(e));
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [selectedSubId, stopDate]);

  const submitRefund = async () => {
    if (!selectedSubId || !stopDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!preview || preview.refundAmount <= 0) {
      toast.error(ct('subscriptions.refundNoAmount'));
      return;
    }
    setSaving(true);
    try {
      const ok = await confirmWithPreview(
        {
          title: ct('subscriptions.newRefund'),
          description: ct('subscriptions.refundPayoutDesc'),
          confirmLabel: ct('subscriptions.refundPayoutAction'),
          variant: 'destructive',
        },
        async () => {
          const { data } = await api.post('/club-subscription-refunds?dryRun=true', {
            subscriptionId: selectedSubId,
            stopDate,
            reason: reason || undefined,
            notes: notes || undefined,
          });
          const rows = (data as { rows?: { label: string; after?: string }[] }).rows;
          if (rows?.length) {
            return { rows, warning: (data as { warning?: string }).warning };
          }
          const p = (data as { preview?: RefundPreview }).preview ?? preview;
          return {
            rows: p
              ? [
                  ...(p.refundBasis === 'sessions' && p.remainingSessions != null
                    ? [{ label: ct('subscriptions.sessionsRemaining'), after: String(p.remainingSessions) }]
                    : [{ label: ct('subscriptions.remainingDays'), after: String(p.remainingDays) }]),
                  { label: ct('subscriptions.refundAmount'), after: formatMoney(p.refundAmount) },
                ]
              : [],
            warning: ct('subscriptions.refundPayoutWarning'),
          };
        },
        async () => {
          await api.post('/club-subscription-refunds', {
            subscriptionId: selectedSubId,
            stopDate,
            reason: reason || undefined,
            notes: notes || undefined,
          });
        },
      );
      if (!ok) return;
      toast.success(ct('subscriptions.refundPayoutSuccess'));
      setSelectedSubId(null);
      setPreview(null);
      setReason('');
      setNotes('');
      void refetchSubs();
      void refetchRefunds();
      void qc.invalidateQueries({ queryKey: ['club-subscription-refunds'] });
      void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <Label className="mb-2 block">{ct('subscriptions.refundSearchLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-md"
            placeholder={ct('subscriptions.refundSearchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedMemberId != null) resetMember();
            }}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          />
          <Button variant="brand" onClick={() => void runSearch()} disabled={searching}>
            <Search className="size-4" /> {ct('common.search')}
          </Button>
          {selectedMemberId != null && (
            <Button variant="outline" onClick={resetMember}>
              {ct('common.cancel')}
            </Button>
          )}
        </div>
        {!selectedMemberId && (searchResult?.hits?.length ?? 0) > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border bg-muted/20 p-2">
            {searchResult!.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted/60"
                  onClick={() => selectMember(hit)}
                >
                  <span className="font-medium">{hit.name}</span>
                  <span className="nums font-mono text-muted-foreground">{hit.memberCode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {member && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{ct('members.name')}</p>
            <p className="text-lg font-semibold">{member.name}</p>
            <p className="text-sm text-muted-foreground nums font-mono">{member.memberCode}</p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 font-medium">{ct('subscriptions.tabSubs')}</h3>
            <div className="space-y-2">
              {(subs ?? []).map((s) => {
                const sessionsLeft =
                  s.sessionsCount != null && s.sessionsUsed != null
                    ? Math.max(0, s.sessionsCount - s.sessionsUsed)
                    : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSubId(s.id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-start transition-colors ${
                      selectedSubId === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{s.subscriptionType ?? '—'}</p>
                      <p className="text-sm text-muted-foreground nums">
                        {ct('subscriptions.paid')}: {formatMoney(s.paidAmount)} · {ct('subscriptions.remaining')}:{' '}
                        {formatMoney(s.remainingAmount)}
                      </p>
                      {sessionsLeft != null ? (
                        <p className="text-xs text-muted-foreground nums">
                          {ct('subscriptions.sessionsRemaining')}: {toArabicDigits(sessionsLeft)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground nums">
                          {ct('subscriptions.endDate')}: {toArabicDigits(s.subscriptionEndDate)}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={s.status === 'active' ? 'active' : 'expired'} />
                  </button>
                );
              })}
              {(subs ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{ct('subscriptions.noRefundableSubs')}</p>
              )}
            </div>
          </div>

          {selectedSubId != null && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <h3 className="font-medium">{ct('subscriptions.refundCancelForm')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{ct('subscriptions.refundStopDate')}</Label>
                  <Input type="date" value={stopDate} onChange={(e) => setStopDate(e.target.value)} />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label>{ct('subscriptions.refundReason')}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="">{ct('subscriptions.refundReason')}</option>
                    <option value="تراجع">{ct('subscriptions.reasonCancel')}</option>
                    <option value="مغادرة">{ct('subscriptions.reasonLeave')}</option>
                    <option value="أخرى">{ct('subscriptions.reasonOther')}</option>
                  </select>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label>{ct('subscriptions.refundNotes')}</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              {preview && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-2">
                  {preview.refundBasis === 'sessions' && preview.remainingSessions != null ? (
                    <p className="nums">
                      {ct('subscriptions.sessionsRemaining')}: {toArabicDigits(preview.remainingSessions)}
                    </p>
                  ) : (
                    <p className="nums">
                      {ct('subscriptions.remainingDays')}: {toArabicDigits(preview.remainingDays)}
                    </p>
                  )}
                  <p className="nums text-muted-foreground">
                    {ui('القيمة الكلية')}: {formatMoney(preview.originalValue)}
                  </p>
                  {preview.paidAmount != null && (
                    <p className="nums text-muted-foreground">
                      {ct('subscriptions.paid')}: {formatMoney(preview.paidAmount)}
                    </p>
                  )}
                  {(() => {
                    const selected = (subs ?? []).find((s) => s.id === selectedSubId);
                    const outstanding = selected?.remainingAmount ?? 0;
                    if (outstanding <= 0) return null;
                    return (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100 nums">
                        {ct('subscriptions.refundOutstanding')}: {formatMoney(outstanding)}
                      </p>
                    );
                  })()}
                  {preview.consumedValue != null && (
                    <p className="nums text-muted-foreground">
                      {ui('قيمة الاستهلاك')}: {formatMoney(preview.consumedValue)}
                    </p>
                  )}
                  <p className="nums text-lg font-semibold">
                    {ct('subscriptions.refundAmount')}: {formatMoney(preview.refundAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{ct('subscriptions.refundCalcHint')}</p>
                  {preview.refundAmount > 0 ? (
                    <p className="text-xs text-muted-foreground">{ct('subscriptions.refundPayoutWarning')}</p>
                  ) : (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {ct('subscriptions.refundNoAmount')}
                    </p>
                  )}
                </div>
              )}

              <Button
                variant="brand"
                onClick={() => void submitRefund()}
                disabled={saving || !preview || preview.refundAmount <= 0}
              >
                <Undo2 className="size-4" /> {ct('subscriptions.refundPayoutAction')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium">{ct('subscriptions.refundHistory')}</h3>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start">{ct('subscriptions.receiptNumber')}</th>
                <th className="p-3 text-start">{ct('common.customer')}</th>
                <th className="p-3 text-start">{ct('subscriptions.refundAmount')}</th>
                <th className="p-3 text-start">{ct('subscriptions.refundDate')}</th>
                <th className="p-3 text-start">{ct('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(refunds ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {ct('common.noData')}
                  </td>
                </tr>
              )}
              {(refunds ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 nums">{r.invoiceNumber}</td>
                  <td className="p-3">{r.customerName ?? '—'}</td>
                  <td className="p-3 nums">{formatMoney(r.refundAmount)}</td>
                  <td className="p-3 nums">{toArabicDigits(r.refundDate)}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status === 'completed' ? 'active' : 'pending'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ClubSubscriptionRefundsPage() {
  const ct = useClubT();
  return (
    <div className="space-y-6">
      <PageHeader title={ct('subscriptions.tabRefunds')} description={ct('subscriptions.refundsPageDesc')} />
      <SubscriptionRefundsWorkspace />
    </div>
  );
}
