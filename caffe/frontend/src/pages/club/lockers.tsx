import type { ColumnDef } from '@tanstack/react-table';
import { MemberCell } from '@/components/club/member-cell';
import { Eye, Lock, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { PaidAmountField } from '@/components/club/paid-amount-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubLockersView } from '@/lib/club-routes';
import type {
  ClubLockerDetails,
  ClubLockerListItem,
  ClubLockerStatistics,
  ClubLockerSubscriptionDetail,
  ClubMemberListItem,
} from '@/types/club';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

interface LockerRow {
  id: number;
  locker_number: string;
  main_branch_id: number;
  sub_branch_id: number;
  is_available: boolean;
}

interface LockerTypeRow {
  id: number;
  name: string;
  meta_value: number;
  days: number;
}

function LockerDetailRow({
  label,
  value,
  nums,
}: {
  label: string;
  value?: string | number | null;
  nums?: boolean;
}) {
  if (value == null || value === '') return null;
  const display = typeof value === 'number' ? String(value) : value;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={`text-end text-sm font-medium ${nums ? 'nums' : ''}`}>
        {nums ? toArabicDigits(display) : display}
      </span>
    </div>
  );
}

function SubscriptionDetailBlock({
  sub,
  ct,
}: {
  sub: ClubLockerSubscriptionDetail;
  ct: (key: string) => string;
}) {
  const statusMap = { active: 'active', expired: 'expired', upcoming: 'pending' } as const;
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <LockerDetailRow label={ct('lockers.customerName')} value={sub.customerName} />
      {sub.memberCode && (
        <LockerDetailRow label={ct('lockers.memberId')} value={sub.memberCode} nums />
      )}
      {sub.memberPhone && (
        <LockerDetailRow label={ct('members.phone')} value={sub.memberPhone} nums />
      )}
      <LockerDetailRow label={ct('lockers.subType')} value={sub.subscriptionTypeName} />
      <LockerDetailRow
        label={ct('lockers.period')}
        value={`${sub.subscriptionStartDate} → ${sub.subscriptionEndDate}`}
        nums
      />
      {sub.subscriptionDays != null && (
        <LockerDetailRow label={ct('lockers.days')} value={sub.subscriptionDays} nums />
      )}
      <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2">
        <span className="text-sm text-muted-foreground">{ct('common.status')}</span>
        <StatusBadge status={statusMap[sub.status]} />
      </div>
      <LockerDetailRow label={ct('subscriptions.subNumber')} value={sub.subscriptionNumber} nums />
      <LockerDetailRow label={ct('lockers.paidAmount')} value={sub.paidAmount} nums />
      <LockerDetailRow label={ct('lockers.registeredBy')} value={sub.bookedByName} />
      <LockerDetailRow label={ct('subscriptions.recommendedEmployee')} value={sub.recommendedEmployeeName} />
    </div>
  );
}

export interface ClubLockersPageProps {
  singleView?: ClubLockersView;
  openSubOnMount?: boolean;
  openLockerOnMount?: boolean;
}

export function ClubLockersPage({
  singleView,
  openSubOnMount,
  openLockerOnMount,
}: ClubLockersPageProps = {}) {
  const ct = useClubT();
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubLockerListItem>(
    'club-locker-subscriptions',
    params,
  );
  const { data: branches } = useBranches();
  const { data: lockerTypes, refetch: refetchTypes } = useArrayResource<LockerTypeRow>('club-locker-types');
  const { data: lockers } = useArrayResource<LockerRow>('club-lockers');
  const { data: stats } = useQuery({
    queryKey: ['club-lockers', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubLockerStatistics>('/club-lockers/statistics');
      return s;
    },
  });

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ct('common.active') },
      { value: 'expired', label: ct('common.expired') },
      { value: 'upcoming', label: ct('common.upcoming') },
    ],
    [ct],
  );

  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const filters: FilterField[] = [
    { key: 'mainBranchId', label: ct('lockers.mainBranch'), type: 'select', options: branchOptions },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
  ];

  const [tab, setTab] = useState<ClubLockersView>(singleView ?? 'subscriptions');
  const [freezeState, setFreezeState] = useState<{ id: number | null; days: string; preview: string | null }>({
    id: null,
    days: '7',
    preview: null,
  });
  const [dialogOpen, setDialogOpen] = useState(!!openSubOnMount);
  const [lockerOpen, setLockerOpen] = useState(!!openLockerOnMount);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeEditId, setTypeEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lockerDetail, setLockerDetail] = useState<ClubLockerDetails | null>(null);

  const [form, setForm] = useState({
    mainBranchId: 0,
    subBranchId: 0,
    memberCode: '',
    customerName: '',
    subscriptionTypeId: '',
    lockerId: '',
    paidAmount: '',
    discountEnabled: false,
    discountValue: '',
    paymentMethod: 'cash',
    gender: 'male',
    recommendedEmployeeId: '',
    subscriptionStartDate: localToday(),
  });
  const [lockerForm, setLockerForm] = useState({
    lockerNumber: '',
    mainBranchId: 0,
    subBranchId: 0,
  });
  const [typeForm, setTypeForm] = useState({ name: '', metaValue: '', days: '' });

  const availableLockers = (lockers ?? []).filter((l) => l.is_available);
  const selectedType = (lockerTypes ?? []).find((t) => String(t.id) === form.subscriptionTypeId);
  const referencePrice = selectedType?.meta_value ?? 0;
  const netDue = form.discountEnabled
    ? Math.max(0, referencePrice - (Number(form.discountValue) || 0))
    : referencePrice;
  const remainingDue = Math.max(0, netDue - (Number(form.paidAmount) || 0));

  const openLockerDialog = () => {
    setLockerForm({
      lockerNumber: '',
      mainBranchId: branches?.[0]?.id ?? 0,
      subBranchId: branches?.[0]?.id ?? 0,
    });
    setLockerOpen(true);
  };

  const openLockerDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setLockerDetail(null);
    try {
      const { data } = await api.get<ClubLockerDetails>(`/club-lockers/${id}/details`);
      setLockerDetail(data);
    } catch (e) {
      toast.error(apiError(e));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const pageTitle =
    singleView === 'lockers'
      ? ct('lockers.manageLockersTitle')
      : singleView === 'types'
        ? ct('lockers.tabTypes')
        : ct('lockers.title');
  const pageDescription =
    singleView === 'lockers'
      ? ct('lockers.manageLockersDescription')
      : singleView === 'types'
        ? ct('lockers.tabTypes')
        : ct('lockers.description');

  const openSubDialog = () => {
    setForm({
      mainBranchId: branches?.[0]?.id ?? 0,
      subBranchId: branches?.[0]?.id ?? 0,
      memberCode: '',
      customerName: '',
      subscriptionTypeId: '',
      lockerId: '',
      paidAmount: '',
      discountEnabled: false,
      discountValue: '',
      paymentMethod: 'cash',
      gender: 'male',
      recommendedEmployeeId: '',
      subscriptionStartDate: localToday(),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.customerName.trim() || !form.lockerId || !form.subscriptionTypeId) {
      toast.error(ct('lockers.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      let memberId: number | undefined;
      if (form.memberCode.trim()) {
        const q = form.memberCode.trim();
        const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
          params: { search: q, pageSize: 5 },
        });
        const exact = list.data.find((m) => m.memberCode === q || m.cardNumber === q);
        if (!exact) {
          toast.error(ct('members.noMemberFound'));
          return;
        }
        memberId = exact.id;
      }
      await api.post('/club-locker-subscriptions', {
        mainBranchId: form.mainBranchId,
        subBranchId: form.subBranchId || form.mainBranchId,
        memberId,
        customerName: form.customerName,
        subscriptionTypeId: Number(form.subscriptionTypeId),
        lockerId: Number(form.lockerId),
        paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
        discountEnabled: form.discountEnabled,
        discountValue: form.discountEnabled ? Number(form.discountValue || 0) : 0,
        paymentMethod: form.paymentMethod,
        gender: form.gender,
        recommendedEmployeeId: form.recommendedEmployeeId ? Number(form.recommendedEmployeeId) : undefined,
        subscriptionStartDate: form.subscriptionStartDate,
      });
      toast.success(ct('lockers.subCreated'));
      setDialogOpen(false);
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveLocker = async () => {
    if (!lockerForm.lockerNumber.trim() || !lockerForm.mainBranchId) {
      toast.error(ct('lockers.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-lockers', {
        lockerNumber: lockerForm.lockerNumber,
        mainBranchId: lockerForm.mainBranchId,
        subBranchId: lockerForm.subBranchId || lockerForm.mainBranchId,
      });
      toast.success(ct('lockers.lockerCreated'));
      setLockerOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveType = async () => {
    if (!typeForm.name.trim() || !typeForm.metaValue || !typeForm.days) {
      toast.error(ct('lockers.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: typeForm.name,
        metaValue: Number(typeForm.metaValue),
        days: Number(typeForm.days),
      };
      if (typeEditId) {
        await api.put(`/club-locker-types/${typeEditId}`, body);
      } else {
        await api.post('/club-locker-types', body);
      }
      toast.success(ct('lockers.typeCreated'));
      setTypeOpen(false);
      setTypeEditId(null);
      void refetchTypes();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const release = async (id: number) => {
    const ok = await confirm({ title: ct('lockers.releaseConfirm') });
    if (!ok) return;
    try {
      await api.patch(`/club-locker-subscriptions/${id}/release`);
      toast.success(ct('lockers.released'));
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // Freeze / unfreeze a locker subscription — backend endpoints exist with a dry-run preview.
  const openFreeze = (id: number) => setFreezeState({ id, days: '7', preview: null });
  const previewFreeze = async () => {
    if (!freezeState.id || !freezeState.days) return;
    try {
      const { data } = await api.patch<{ preview?: { newEndDate?: string } }>(
        `/club-locker-subscriptions/${freezeState.id}/freeze?dryRun=true`,
        { days: Number(freezeState.days) },
      );
      setFreezeState((s) => ({ ...s, preview: data?.preview?.newEndDate ?? '—' }));
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const doFreeze = async () => {
    if (!freezeState.id || !freezeState.days) return;
    try {
      await api.patch(`/club-locker-subscriptions/${freezeState.id}/freeze`, { days: Number(freezeState.days) });
      toast.success(ui('تم تجميد اللوكر'));
      setFreezeState({ id: null, days: '7', preview: null });
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const doUnfreeze = async (id: number) => {
    try {
      const { data } = await api.patch<{ preview?: { newEndDate?: string } }>(
        `/club-locker-subscriptions/${id}/unfreeze?dryRun=true`,
      );
      const ok = await confirm({
        title: ui('إلغاء تجميد اللوكر'),
        description: data?.preview?.newEndDate ? `${ui('تاريخ النهاية الجديد:')} ${data.preview.newEndDate}` : undefined,
      });
      if (!ok) return;
      await api.patch(`/club-locker-subscriptions/${id}/unfreeze`);
      toast.success(ui('تم إلغاء تجميد اللوكر'));
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (id: number) => {
    const ok = await confirm({
      title: ct('lockers.deleteSubConfirm'),
      variant: 'destructive',
      confirmLabel: ct('common.delete'),
    });
    if (!ok) return;
    try {
      await api.delete(`/club-locker-subscriptions/${id}`);
      toast.success(ct('lockers.deleted'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removeLocker = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-lockers/${id}`);
      toast.success(ct('lockers.deleted'));
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removeType = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-locker-types/${id}`);
      toast.success(ct('lockers.deleted'));
      void refetchTypes();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<ClubLockerListItem>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
      {
        id: 'customer',
        header: ct('lockers.customerName'),
        cell: ({ row }) => (
          <MemberCell
            name={row.original.memberName ?? row.original.customerName}
            code={row.original.memberCode}
            memberId={row.original.memberId}
            profilePicture={row.original.memberProfilePicture}
            fallback={row.original.customerName}
          />
        ),
      },
      {
        accessorKey: 'subscriptionEndDate',
        header: ct('lockers.endDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        cell: ({ row }) => {
          const map = { active: 'active', expired: 'expired', upcoming: 'pending' } as const;
          return <StatusBadge status={map[row.original.status]} />;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void release(row.original.id)}>{ct('lockers.release')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}>{ui('تجميد')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void doUnfreeze(row.original.id)}>{ui('إلغاء التجميد')}</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>{ct('common.delete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [ct, ui],
  );

  if (isError && singleView !== 'lockers' && singleView !== 'types') {
    return (
      <div className="space-y-6">
        <PageHeader title={pageTitle} description={pageDescription} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        actions={
          singleView === 'lockers' ? (
            <Button variant="brand" onClick={openLockerDialog}>
              <Plus className="size-4" /> {ct('lockers.newLocker')}
            </Button>
          ) : singleView === 'types' ? (
            <Button
              variant="brand"
              onClick={() => {
                setTypeEditId(null);
                setTypeForm({ name: '', metaValue: '', days: '' });
                setTypeOpen(true);
              }}
            >
              <Plus className="size-4" /> {ct('lockers.newType')}
            </Button>
          ) : (
            <Button variant="brand" onClick={openSubDialog}>
              <Plus className="size-4" /> {ct('lockers.newSub')}
            </Button>
          )
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClubStatCard label={ct('lockers.totalLockers')} value={stats.total} />
          <ClubStatCard label={ct('lockers.available')} value={stats.available} />
          <ClubStatCard label={ct('lockers.occupied')} value={stats.unavailable} />
          <ClubStatCard label={ct('lockers.activeSubs')} value={stats.activeSubscriptions} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubLockersView)}>
        {!singleView && (
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="subscriptions"><Lock className="size-4" /> {ct('lockers.tabSubs')}</TabsTrigger>
          <TabsTrigger value="lockers"><Lock className="size-4" /> {ct('lockers.tabLockers')}</TabsTrigger>
          <TabsTrigger value="types"><Settings className="size-4" /> {ct('lockers.tabTypes')}</TabsTrigger>
        </TabsList>
        )}

        <TabsContent value="subscriptions" className="space-y-4 pt-4">
          <FilterBar fields={filters} />
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ct('lockers.emptySubs')}
          />
        </TabsContent>

        <TabsContent value="lockers" className="space-y-4 pt-4">
          {!singleView && (
            <Button variant="outline" onClick={openLockerDialog}>
              <Plus className="size-4" /> {ct('lockers.newLocker')}
            </Button>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('lockers.lockerNumber')}</th>
                  <th className="p-3 text-start">{ct('lockers.mainBranch')}</th>
                  <th className="p-3 text-start">{ct('lockers.availability')}</th>
                  <th className="p-3 text-start">{ct('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(lockers ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{ct('lockers.emptyLockers')}</td></tr>
                )}
                {(lockers ?? []).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3 nums font-mono">{l.locker_number}</td>
                    <td className="p-3">{branchOptions.find((b) => b.value === String(l.main_branch_id))?.label ?? '—'}</td>
                    <td className="p-3">
                      <StatusBadge
                        status={l.is_available ? 'active' : 'suspended'}
                        label={l.is_available ? ct('lockers.available') : ct('lockers.occupied')}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={ct('lockers.viewDetails')}
                          onClick={() => void openLockerDetail(l.id)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeLocker(l.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="types" className="space-y-4 pt-4">
          {!singleView && (
            <Button variant="outline" onClick={() => { setTypeEditId(null); setTypeForm({ name: '', metaValue: '', days: '' }); setTypeOpen(true); }}>
              <Plus className="size-4" /> {ct('lockers.newType')}
            </Button>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(lockerTypes ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground nums">
                    {toArabicDigits(t.meta_value)} · {toArabicDigits(t.days)} {ct('lockers.days')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTypeEditId(t.id);
                      setTypeForm({ name: t.name, metaValue: String(t.meta_value), days: String(t.days) });
                      setTypeOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeType(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(lockerTypes ?? []).length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground">{ct('lockers.emptyTypes')}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('lockers.newSubTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('lockers.customerName')}</Label>
              <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lockers.memberId')}</Label>
              <Input className="font-mono" dir="ltr" value={form.memberCode} onChange={(e) => setForm((f) => ({ ...f, memberCode: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lockers.subType')}</Label>
              <select className={selectCls} value={form.subscriptionTypeId} onChange={(e) => setForm((f) => ({ ...f, subscriptionTypeId: e.target.value }))}>
                <option value="">—</option>
                {(lockerTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {selectedType && (
                <p className="text-xs text-muted-foreground nums">
                  {ct('lockers.metaValue')}: {toArabicDigits(referencePrice)} · {ct('lockers.days')}: {toArabicDigits(selectedType.days)} · {ct('lockers.paidAmount')}: {toArabicDigits(netDue)} · {ct('common.remaining')}: {toArabicDigits(remainingDue)}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>{ct('lockers.selectLocker')}</Label>
              <select className={selectCls} value={form.lockerId} onChange={(e) => setForm((f) => ({ ...f, lockerId: e.target.value }))}>
                <option value="">—</option>
                {availableLockers.map((l) => <option key={l.id} value={l.id}>{l.locker_number}</option>)}
              </select>
            </div>
            <PaidAmountField
              label={ct('lockers.paidAmount')}
              value={form.paidAmount}
              max={netDue > 0 ? netDue : undefined}
              onChange={(paidAmount) => setForm((current) => ({ ...current, paidAmount }))}
            />
            <div className="flex items-center gap-2">
              <input
                id="locker-discount"
                type="checkbox"
                checked={form.discountEnabled}
                onChange={(e) => setForm((f) => ({ ...f, discountEnabled: e.target.checked }))}
              />
              <Label htmlFor="locker-discount">{ct('common.discount')}</Label>
            </div>
            {form.discountEnabled && (
              <div className="grid gap-2">
                <Label>{ct('common.discountValue')}</Label>
                <Input className="nums" value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ct('common.paymentMethod')}</Label>
                <select className={selectCls} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="cash">{ct('common.cash')}</option>
                  <option value="card">{ct('common.card')}</option>
                  <option value="bank">{ct('common.bank')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('common.gender')}</Label>
                <select className={selectCls} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="male">{ct('common.male')}</option>
                  <option value="female">{ct('common.female')}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ct('subscriptions.recommendedEmployee')}</Label>
              <Input className="nums" value={form.recommendedEmployeeId} onChange={(e) => setForm((f) => ({ ...f, recommendedEmployeeId: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lockers.startDate')}</Label>
              <Input type="date" value={form.subscriptionStartDate} onChange={(e) => setForm((f) => ({ ...f, subscriptionStartDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lockerOpen} onOpenChange={setLockerOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('lockers.newLocker')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('lockers.lockerNumber')}</Label>
              <Input value={lockerForm.lockerNumber} onChange={(e) => setLockerForm((f) => ({ ...f, lockerNumber: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lockers.mainBranch')}</Label>
              <select
                className={selectCls}
                value={lockerForm.mainBranchId || ''}
                onChange={(e) => setLockerForm((f) => ({ ...f, mainBranchId: Number(e.target.value), subBranchId: Number(e.target.value) }))}
              >
                {branchOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockerOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveLocker()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{typeEditId ? ct('common.edit') : ct('lockers.newType')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input placeholder={ct('members.typeName')} value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} />
            <Input className="nums" placeholder={ct('lockers.metaValue')} value={typeForm.metaValue} onChange={(e) => setTypeForm((f) => ({ ...f, metaValue: e.target.value }))} />
            <Input className="nums" placeholder={ct('lockers.days')} value={typeForm.days} onChange={(e) => setTypeForm((f) => ({ ...f, days: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveType()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {ct('lockers.lockerDetailsTitle')}
              {lockerDetail && (
                <span className="ms-2 font-mono text-base text-muted-foreground nums">
                  {toArabicDigits(lockerDetail.lockerNumber)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">{ct('common.loading')}</p>
          )}
          {!detailLoading && lockerDetail && (
            <div className="space-y-5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={lockerDetail.isAvailable ? 'active' : 'suspended'}
                  label={lockerDetail.isAvailable ? ct('lockers.available') : ct('lockers.occupied')}
                />
                <span className="text-sm text-muted-foreground">
                  {branchOptions.find((b) => b.value === String(lockerDetail.mainBranchId))?.label ?? '—'}
                </span>
                <span className="text-sm text-muted-foreground nums">
                  · {ct('lockers.totalBookings')}: {toArabicDigits(lockerDetail.totalBookings)}
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{ct('lockers.currentBooking')}</h4>
                {lockerDetail.currentSubscription ? (
                  <SubscriptionDetailBlock sub={lockerDetail.currentSubscription} ct={ct} />
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    {ct('lockers.noCurrentBooking')}
                  </p>
                )}
              </div>

              {lockerDetail.lastBooking &&
                lockerDetail.lastBooking.id !== lockerDetail.currentSubscription?.id && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">{ct('lockers.lastBooking')}</h4>
                    <SubscriptionDetailBlock sub={lockerDetail.lastBooking} ct={ct} />
                  </div>
                )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{ct('lockers.bookingHistory')}</h4>
                {lockerDetail.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ct('lockers.noBookingHistory')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-start">{ct('lockers.customerName')}</th>
                          <th className="p-2 text-start">{ct('lockers.period')}</th>
                          <th className="p-2 text-start">{ct('lockers.bookedBy')}</th>
                          <th className="p-2 text-start">{ct('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lockerDetail.history.map((h) => {
                          const statusMap = { active: 'active', expired: 'expired', upcoming: 'pending' } as const;
                          return (
                            <tr key={h.id} className="border-t">
                              <td className="p-2">{h.customerName}</td>
                              <td className="p-2 nums whitespace-nowrap">
                                {toArabicDigits(h.subscriptionStartDate)} → {toArabicDigits(h.subscriptionEndDate)}
                              </td>
                              <td className="p-2">{h.bookedByName ?? '—'}</td>
                              <td className="p-2">
                                <StatusBadge status={statusMap[h.status]} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>{ct('common.cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeState.id !== null} onOpenChange={(o) => !o && setFreezeState({ id: null, days: '7', preview: null })}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('تجميد اللوكر')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{ui('عدد أيام التجميد')}</Label>
              <Input
                className="nums"
                type="number"
                min={1}
                value={freezeState.days}
                onChange={(e) => setFreezeState((s) => ({ ...s, days: e.target.value, preview: null }))}
              />
            </div>
            {freezeState.preview && (
              <p className="rounded-lg bg-muted/50 p-2 text-sm">
                {ui('تاريخ النهاية الجديد:')} <span className="nums font-medium">{toArabicDigits(freezeState.preview)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void previewFreeze()}>{ui('معاينة')}</Button>
            <Button variant="brand" onClick={() => void doFreeze()}>{ui('تأكيد التجميد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
