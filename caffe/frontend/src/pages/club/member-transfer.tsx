import { ArrowRightLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type { ClubMemberListItem, ClubSubscriptionListItem } from '@/types/club';

export function ClubMemberTransferPage() {
  const ct = useClubT();
  const subQuery = useListQuery({ pageSize: 200 });
  const memberQuery = useListQuery({ pageSize: 200 });
  const [memberSearch, setMemberSearch] = useState('');
  const { data: subs, refetch: refetchSubs } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    subQuery.params,
  );
  const { data: members } = usePaginatedList<ClubMemberListItem>('club-members', {
    ...memberQuery.params,
    search: memberSearch || memberQuery.params.search,
  });
  const [subscriptionId, setSubscriptionId] = useState('');
  const [targetMemberId, setTargetMemberId] = useState('');
  const [saving, setSaving] = useState(false);

  const sub = useMemo(
    () => (subs?.data ?? []).find((s) => s.id === Number(subscriptionId)),
    [subs, subscriptionId],
  );
  const target = useMemo(
    () => (members?.data ?? []).find((m) => m.id === Number(targetMemberId)),
    [members, targetMemberId],
  );

  const transfer = async () => {
    if (!subscriptionId || !targetMemberId) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/club-subscriptions/${subscriptionId}/transfer-member`, {
        memberId: Number(targetMemberId),
      });
      toast.success(ct('common.success'));
      setSubscriptionId('');
      setTargetMemberId('');
      void refetchSubs();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={ct('subscriptions.memberTransfer')} description="" />
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-2">
          <Label>{ct('subscriptions.subscriptionId')}</Label>
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
          >
            <option value="">—</option>
            {(subs?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.subscriptionNumber} — {s.customerName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label>{ct('members.memberCode')}</Label>
          <Input
            className="mb-2"
            placeholder={ct('common.search')}
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={targetMemberId}
            onChange={(e) => setTargetMemberId(e.target.value)}
          >
            <option value="">—</option>
            {(members?.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.memberCode})
              </option>
            ))}
          </select>
        </div>
        {sub && target && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">
            {sub.customerName} → {target.name} ({target.memberCode})
          </p>
        )}
        <Button variant="brand" className="w-full" onClick={() => void transfer()} disabled={saving}>
          <ArrowRightLeft className="size-4" /> {ct('subscriptions.memberTransfer')}
        </Button>
      </div>
    </div>
  );
}
