import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MaskedPhone } from '@/components/club/masked-phone';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';
import { cn, toArabicDigits } from '@/lib/utils';

type RequestStatus = 'pending' | 'scheduled' | 'approved' | 'rejected' | 'failed';

interface FreezeRequestRow {
  id: number;
  status: RequestStatus;
  startDate: string;
  days: number;
  reason: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
  memberId: number;
  memberName: string | null;
  memberCode: string | null;
  memberPhone: string | null;
  subscriptionNumber: string | null;
  subscriptionType: string | null;
  subscriptionEndDate: string | null;
}

const TABS: { key: RequestStatus | 'all'; label: string }[] = [
  { key: 'pending', label: uiStatic('بانتظار المراجعة') },
  { key: 'scheduled', label: uiStatic('مجدولة') },
  { key: 'approved', label: uiStatic('تم الوقف') },
  { key: 'rejected', label: uiStatic('مرفوضة') },
  { key: 'failed', label: uiStatic('تعذر تنفيذها') },
  { key: 'all', label: uiStatic('الكل') },
];

const STATUS_BADGE: Record<RequestStatus, { status: StatusKey; label: string }> = {
  pending: { status: 'pending', label: uiStatic('بانتظار المراجعة') },
  scheduled: { status: 'info', label: uiStatic('مجدولة') },
  approved: { status: 'approved', label: uiStatic('تم الوقف') },
  rejected: { status: 'rejected', label: uiStatic('مرفوضة') },
  failed: { status: 'expired', label: uiStatic('تعذر تنفيذها') },
};

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

/**
 * طلبات الوقف من التطبيق — members ask to freeze from the app; reception decides here.
 * Approving runs the normal freeze with the package's rules. A request that starts later is
 * scheduled and frozen automatically on its start date, so the member does not lose those days.
 */
export function ClubFreezeRequestsPage() {
  const { can } = usePermission();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const actionBusy = useRef(false);
  const canUpdate = can('club.subscriptions.freeze_requests:update') || can('club.subscriptions.list:update');
  const [tab, setTab] = useState<RequestStatus | 'all'>('pending');
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<FreezeRequestRow | null>(null);
  const [note, setNote] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-freeze-requests', tab],
    queryFn: async () => {
      const { data: d } = await api.get<{ data: FreezeRequestRow[]; counts: Partial<Record<RequestStatus, number>> }>(
        '/club-freeze-requests',
        { params: { status: tab } },
      );
      return d;
    },
  });
  const rows = data?.data ?? [];
  const counts = data?.counts ?? {};

  function refreshOperations() {
    for (const key of ['club-freeze-requests', 'club-subscriptions', 'club-members', 'club-reception-subs', 'club-reception-member', 'club-universal-search']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  async function approve(row: FreezeRequestRow) {
    if (!canUpdate || actionBusy.current) return;
    actionBusy.current = true;
    setActingId(row.id);
    try {
      const later = row.startDate > today();
      const ok = await confirm({
        title: uiStatic('الموافقة على طلب الوقف؟'),
        description: later
          ? `${uiStatic('الاشتراك هيتوقف تلقائيًا يوم')} ${toArabicDigits(row.startDate)} ${uiStatic('لمدة')} ${toArabicDigits(row.days)} ${uiStatic('يوم.')}`
          : `${uiStatic('الاشتراك هيتوقف من النهارده لمدة')} ${toArabicDigits(row.days)} ${uiStatic('يوم.')}`,
      });
      if (!ok) return;
      const { data: res } = await api.post<{ status: RequestStatus }>(`/club-freeze-requests/${row.id}/approve`);
      toast.success(res.status === 'scheduled' ? uiStatic('تمت الموافقة — الوقف مجدول') : uiStatic('تم وقف الاشتراك'));
      refreshOperations();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      actionBusy.current = false;
      setActingId(null);
    }
  }

  async function submitReject() {
    if (!canUpdate || !rejecting || actionBusy.current) return;
    actionBusy.current = true;
    setActingId(rejecting.id);
    try {
      await api.post(`/club-freeze-requests/${rejecting.id}/reject`, { note: note.trim() || undefined });
      toast.success(uiStatic('تم رفض الطلب وإبلاغ العضو'));
      setRejecting(null);
      setNote('');
      refreshOperations();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      actionBusy.current = false;
      setActingId(null);
    }
  }

  const columns = useMemo<ColumnDef<FreezeRequestRow>[]>(
    () => [
      {
        id: 'member',
        header: uiStatic('العضو'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.memberName ?? `#${row.original.memberId}`}</p>
            <p className="nums text-xs text-muted-foreground">
              {row.original.memberCode ?? '—'}
              {row.original.memberPhone ? <> · <MaskedPhone value={row.original.memberPhone} memberId={row.original.memberId} /></> : null}
            </p>
          </div>
        ),
      },
      {
        id: 'subscription',
        header: uiStatic('الاشتراك'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.subscriptionType ?? '—'}</p>
            <p className="nums text-xs text-muted-foreground">
              {row.original.subscriptionNumber ?? '—'}
              {row.original.subscriptionEndDate ? ` · ${uiStatic('ينتهي')} ${row.original.subscriptionEndDate}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'period',
        header: uiStatic('الوقف المطلوب'),
        cell: ({ row }) => (
          <span className="nums">
            {toArabicDigits(row.original.days)} {uiStatic('يوم')} · {uiStatic('من')} {row.original.startDate}
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: uiStatic('السبب'),
        cell: ({ getValue }) => <span className="line-clamp-2 max-w-[18rem]">{(getValue() as string | null) ?? '—'}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: uiStatic('تاريخ الطلب'),
        cell: ({ getValue }) => <span className="nums">{String(getValue()).slice(0, 10)}</span>,
      },
      {
        accessorKey: 'status',
        header: uiStatic('الحالة'),
        cell: ({ row }) => {
          const badge = STATUS_BADGE[row.original.status];
          return (
            <div className="space-y-1">
              <StatusBadge status={badge.status} label={uiStatic(badge.label)} />
              {row.original.decisionNote ? <p className="max-w-[16rem] text-xs text-muted-foreground">{row.original.decisionNote}</p> : null}
              {row.original.decidedByName ? <p className="text-xs text-muted-foreground">{row.original.decidedByName}</p> : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: uiStatic('إجراءات'),
        cell: ({ row }) => {
          const item = row.original;
          if (!canUpdate) return null;
          const canApprove = item.status === 'pending';
          const canReject = item.status === 'pending' || item.status === 'scheduled';
          if (!canApprove && !canReject) return null;
          return (
            <div className="flex gap-1">
              {canApprove ? (
                <Button permissionAction="update" size="sm" variant="outline" disabled={actingId != null} onClick={() => void approve(item)}>
                  <Check className="size-4 text-emerald-600" /> {uiStatic('موافقة')}
                </Button>
              ) : null}
              <Button
                permissionAction="update"
                size="sm"
                variant="outline"
                disabled={actingId != null}
                onClick={() => { setNote(''); setRejecting(item); }}
              >
                <X className="size-4 text-destructive" /> {uiStatic('رفض')}
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actingId, canUpdate, locale],
  );

  return (
    <ListPageShell>
      <PageHeader
        title={uiStatic('طلبات الوقف من التطبيق')}
        description={uiStatic('الأعضاء بيطلبوا وقف اشتراكهم من التطبيق. الموافقة بتطبّق قواعد التجميد بتاعة الباقة، والطلب اللي بيبدأ بعدين بيتنفّذ تلقائيًا في يومه.')}
      />
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.key === 'all' ? undefined : counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
              )}
            >
              {uiStatic(t.label)}
              {count ? <span className="nums ms-1.5 rounded-full bg-black/15 px-1.5 text-xs">{toArabicDigits(count)}</span> : null}
            </button>
          );
        })}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={rows.length || 10}
        onPageChange={() => {}}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={uiStatic('لا توجد طلبات')}
        enableExport={false}
      />

      <Dialog open={rejecting != null} onOpenChange={(open) => { if (!open && !actionBusy.current) setRejecting(null); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{uiStatic('رفض طلب الوقف')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="freeze-rejection-note">{uiStatic('السبب (هيوصل للعضو في التطبيق)')}</Label>
            <Textarea id="freeze-rejection-note" disabled={actingId != null} value={note} maxLength={255} rows={3} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={actingId != null} onClick={() => setRejecting(null)}>{uiStatic('إلغاء')}</Button>
            <Button permissionAction="update" variant="destructive" disabled={actingId != null} onClick={() => void submitReject()}>
              {uiStatic('رفض الطلب')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
