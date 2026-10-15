import type { ColumnDef } from '@tanstack/react-table';
import { MemberCell } from '@/components/club/member-cell';
import {
  CalendarCheck2,
  CircleCheckBig,
  Eye,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatDateTime, localToday } from '@/lib/formatters';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { runAutoPrintOnce } from '@/lib/club-printing';
import type { ClubLockersView } from '@/lib/club-routes';
import type {
  ClubLockerDetails,
  ClubLockerListItem,
  ClubLockerStatistics,
  ClubLockerSubscriptionDetail,
  ClubMemberListItem,
} from '@/types/club';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function LockerMiniTable({
  rows,
  emptyLabel,
  branchOptions,
  ct,
  canDelete,
  onOpen,
  onDelete,
}: {
  rows: LockerRow[];
  emptyLabel: string;
  branchOptions: Array<{ value: string; label: string }>;
  ct: (key: string) => string;
  canDelete: boolean;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-start font-medium">{ct('lockers.lockerNumber')}</th>
            <th className="px-4 py-3 text-start font-medium">{ct('lockers.withWhom')}</th>
            <th className="px-4 py-3 text-start font-medium">{ct('lockers.availability')}</th>
            <th className="px-4 py-3 text-start font-medium">{ct('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">{emptyLabel}</td></tr>
          ) : rows.map((locker) => (
            <tr key={locker.id} className="border-t transition-colors hover:bg-muted/20">
              <td className="px-4 py-3">
                <button type="button" className="nums font-semibold text-primary underline-offset-4 hover:underline" onClick={() => onOpen(locker.id)}>
                  <span dir="ltr">{locker.locker_number}</span>
                </button>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {branchOptions.find((branch) => branch.value === String(locker.main_branch_id))?.label ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3">{locker.current_holder?.member_name ?? ct('lockers.nobodyHolding')}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={locker.is_available ? 'active' : 'suspended'}
                  label={locker.is_available ? ct('lockers.available') : ct('lockers.occupied')}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={ct('lockers.bookingHistory')}
                    aria-label={ct('lockers.bookingHistory')}
                    onClick={() => onOpen(locker.id)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={ct('common.delete')}
                      onClick={() => onDelete(locker.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LockerHolder {
  member_id: number | null;
  member_name: string;
  member_code: string | null;
  since: string;
  source: 'handoff' | 'subscription';
}

interface LockerRow {
  id: number;
  locker_number: string;
  main_branch_id: number;
  sub_branch_id: number;
  is_available: boolean;
  section?: 'male' | 'female' | 'shared' | null;
  current_holder?: LockerHolder | null;
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
  const { ui, locale } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const { can } = usePermission();
  const canCreate = can('club.lockers.list:create') || can('club.lockers.new:create');
  const canUpdate = can('club.lockers.list:update');
  const canUpdateSplit = canUpdate || can('club.lockers.settings:update');
  const canDelete = can('club.lockers.list:delete');
  const canCreateType = can('club.lockers.settings:create');
  const canUpdateType = can('club.lockers.settings:update');
  const canDeleteType = can('club.lockers.settings:delete');
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

  const requestedTab = searchParams.get('tab');
  const tab: ClubLockersView = singleView
    ?? (requestedTab === 'subscriptions' || requestedTab === 'types' || requestedTab === 'lockers' ? requestedTab : 'lockers');
  const setTab = (next: ClubLockersView) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };
  const splitQuery = useQuery({
    queryKey: ['locker-gender-split'],
    queryFn: async () => (await api.get<{ splitByGender: boolean }>('/club-lockers/split')).data,
  });
  const splitByGender = splitQuery.data?.splitByGender === true;
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
  useEffect(() => {
    if (lockerForm.mainBranchId || !branches?.length) return;
    setLockerForm((current) => ({
      ...current,
      mainBranchId: branches[0].id,
      subBranchId: branches[0].id,
    }));
  }, [branches, lockerForm.mainBranchId]);
  const [typeForm, setTypeForm] = useState({ name: '', metaValue: '', days: '' });

  const availableLockers = (lockers ?? []).filter((locker) => {
    if (!locker.is_available) return false;
    if (!splitByGender) return true;
    const section = locker.section ?? 'shared';
    if (section === 'shared') return true;
    return section === form.gender;
  });
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

  const saveSplit = async (enabled: boolean) => {
    try {
      await api.patch('/club-lockers/split', { enabled });
      await qc.invalidateQueries({ queryKey: ['locker-gender-split'] });
      toast.success(enabled ? ui('اللوكرات اتقسمت حريمي ورجالي') : ui('اللوكرات رجعت مجموعة واحدة'));
    } catch (error) {
      toast.error(apiError(error));
    }
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
    if (!canCreate) return;
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
      const { data: created } = await api.post<ClubLockerSubscriptionDetail & { receiptNumber?: string | null }>('/club-locker-subscriptions', {
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
      const receiptReference = created.receiptNumber || created.subscriptionNumber;
      if (shouldPrint('locker', created.paidAmount, receiptReference)) {
        const selectedType = lockerTypes?.find((type) => type.id === Number(form.subscriptionTypeId));
        const selectedLocker = lockers?.find((locker) => locker.id === Number(form.lockerId));
        runAutoPrintOnce('locker', receiptReference, () => printThermalFinancialReceiptWithFallback({
          documentNumber: receiptReference,
          transactionLabel: 'Locker subscription',
          itemName: `${selectedType?.name || 'Locker'}${selectedLocker ? ` — ${selectedLocker.locker_number}` : ''}`,
          customerName: created.customerName,
          memberCode: form.memberCode || null,
          branchName: branches?.find((branch) => branch.id === Number(form.mainBranchId))?.name,
          collectedAmount: created.paidAmount,
          paymentMethod: created.paymentMethod || form.paymentMethod,
          operatorName: user?.name,
          subscriptionNumber: created.subscriptionNumber,
        }, policy));
      }
      setDialogOpen(false);
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveLocker = async (section: 'male' | 'female' | 'shared' = 'shared', number = lockerForm.lockerNumber) => {
    if (!canCreate) return;
    if (!number.trim() || !lockerForm.mainBranchId) {
      toast.error(ct('lockers.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-lockers', {
        lockerNumber: number.trim(),
        mainBranchId: lockerForm.mainBranchId,
        subBranchId: lockerForm.subBranchId || lockerForm.mainBranchId,
        section: splitByGender ? section : 'shared',
      });
      toast.success(ct('lockers.lockerCreated'));
      setLockerForm((current) => ({ ...current, lockerNumber: '' }));
      if (!splitByGender) setLockerOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const releaseHeldLocker = async (memberId: number, lockerId: number) => {
    try {
      await api.post('/club-lockers/handoff/release', { memberId });
      toast.success(ui('تم إرجاع اللوكر'));
      await qc.invalidateQueries({ queryKey: ['club-lockers'] });
      await openLockerDetail(lockerId);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveType = async () => {
    if (typeEditId ? !canUpdateType : !canCreateType) return;
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
    if (!canUpdate) return;
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
    if (!canUpdate) return;
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
    if (!canUpdate) return;
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
    if (!canUpdate) return;
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
    if (!canDelete) return;
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
    if (!canDelete) return;
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
    if (!canDeleteType) return;
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
        cell: ({ row }) => (canUpdate || canDelete) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && <DropdownMenuItem onSelect={() => void release(row.original.id)}>{ct('lockers.release')}</DropdownMenuItem>}
              {canUpdate && <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}>{ui('تجميد')}</DropdownMenuItem>}
              {canUpdate && <DropdownMenuItem onSelect={() => void doUnfreeze(row.original.id)}>{ui('إلغاء التجميد')}</DropdownMenuItem>}
              {canDelete && <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>{ct('common.delete')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
      },
    ],
    [ct, ui, canUpdate, canDelete],
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
          tab === 'lockers' ? (canCreate && !splitByGender ? (
            <Button variant="brand" onClick={openLockerDialog}>
              <Plus className="size-4" /> {ct('lockers.addLocker')}
            </Button>
          ) : undefined) : tab === 'types' ? (canCreateType ? (
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
          ) : undefined) : (canCreate ? (
            <Button variant="brand" onClick={openSubDialog}>
              <Plus className="size-4" /> {ct('lockers.newSub')}
            </Button>
          ) : undefined)
        }
      />

      {stats && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label={pageTitle}>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[
              { label: ct('lockers.totalLockers'), value: stats.total, icon: LockKeyhole, tone: 'text-primary bg-primary/10' },
              { label: ct('lockers.available'), value: stats.available, icon: CircleCheckBig, tone: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
              { label: ct('lockers.occupied'), value: stats.unavailable, icon: UsersRound, tone: 'text-amber-700 bg-amber-500/10 dark:text-amber-300' },
              { label: ct('lockers.activeSubs'), value: stats.activeSubscriptions, icon: CalendarCheck2, tone: 'text-sky-700 bg-sky-500/10 dark:text-sky-300' },
            ].map((metric, index) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className={`flex min-h-24 items-center gap-3 px-4 py-4 sm:px-5 ${index < 2 ? 'border-b sm:border-b-0' : ''} ${index % 2 === 0 ? 'border-e' : ''} ${index < 3 ? 'sm:border-e' : 'sm:border-e-0'}`}
                >
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-muted-foreground">{metric.label}</span>
                    <span className="nums mt-1 block text-2xl font-bold leading-none text-foreground">{toArabicDigits(metric.value)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubLockersView)}>
        {!singleView && (
        <div className="flex justify-center">
          <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3 gap-1 p-1">
            <TabsTrigger value="lockers" className="px-3 py-2 text-sm font-semibold">{ct('lockers.tabLockers')}</TabsTrigger>
            <TabsTrigger value="subscriptions" className="px-3 py-2 text-sm font-semibold">{ct('lockers.tabSubs')}</TabsTrigger>
            <TabsTrigger value="types" className="px-3 py-2 text-sm font-semibold">{ct('lockers.tabTypes')}</TabsTrigger>
          </TabsList>
        </div>
        )}

        <TabsContent value="subscriptions" className="space-y-4 pt-4">
          <FilterBar fields={filters} />
          <DataTable
            exportSource={{ resource: 'club-locker-subscriptions', params }}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold">{ui('تقسيم اللوكرات حريمي ورجالي')}</p>
              <p className="text-xs text-muted-foreground">{ui('نفس الرقم ينفع يتكرر، واحد رجالي وواحد حريمي.')}</p>
            </div>
            <Switch
              checked={splitByGender}
              disabled={!canUpdateSplit}
              onCheckedChange={(checked) => void saveSplit(checked)}
              aria-label={ui('تقسيم اللوكرات حريمي ورجالي')}
            />
          </div>
          {splitByGender ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {(['male', 'female'] as const).map((section) => {
                const rows = (lockers ?? []).filter((locker) => (locker.section ?? 'shared') === section);
                const male = section === 'male';
                return (
                  <section
                    key={section}
                    className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                  >
                    <header className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
                      <span className={male
                        ? 'flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300'
                        : 'flex size-9 items-center justify-center rounded-xl bg-pink-500/10 text-pink-700 dark:text-pink-300'}
                      >
                        <UserRound className="size-4.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground">{male ? ui('لوكرات رجالي') : ui('لوكرات حريمي')}</h3>
                        <p className="nums text-xs text-muted-foreground">
                          {toArabicDigits(rows.length)} {ui('لوكر')}
                        </p>
                      </div>
                    </header>
                    {canCreate ? (
                      <form
                        className="flex flex-wrap items-end gap-3 px-4 py-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void saveLocker(section, String(data.get('number') ?? ''));
                          event.currentTarget.reset();
                        }}
                      >
                        <div className="grid min-w-28 flex-1 gap-1.5">
                          <Label>{ct('lockers.lockerNumber')}</Label>
                          <Input name="number" dir="ltr" className="nums bg-background" />
                        </div>
                        <div className="grid min-w-36 flex-1 gap-1.5">
                          <Label>{ct('lockers.mainBranch')}</Label>
                          <select
                            className={`${selectCls} bg-background`}
                            value={lockerForm.mainBranchId || ''}
                            onChange={(event) => setLockerForm((current) => ({
                              ...current,
                              mainBranchId: Number(event.target.value),
                              subBranchId: Number(event.target.value),
                            }))}
                          >
                            {branchOptions.map((branch) => <option key={branch.value} value={branch.value}>{branch.label}</option>)}
                          </select>
                        </div>
                        <Button type="submit" variant="brand" permissionAction="create" disabled={saving}>
                          <Plus className="size-4" /> {ct('lockers.addLocker')}
                        </Button>
                      </form>
                    ) : null}
                    <LockerMiniTable
                      rows={rows}
                      emptyLabel={ct('lockers.emptyLockers')}
                      branchOptions={branchOptions}
                      ct={ct}
                      canDelete={canDelete}
                      onOpen={(id) => void openLockerDetail(id)}
                      onDelete={(id) => void removeLocker(id)}
                    />
                  </section>
                );
              })}
            </div>
          ) : null}
          {splitByGender && (lockers ?? []).some((locker) => (locker.section ?? 'shared') === 'shared') ? (
            <p className="text-sm text-muted-foreground">{ui('لوكرات قبل التقسيم لسه ظاهرة تحت، وتفضل متاحة للرجالي والحريمي لحد ما تتضاف في القسم المناسب.')}</p>
          ) : null}
          {!splitByGender || (lockers ?? []).some((locker) => (locker.section ?? 'shared') === 'shared') ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('lockers.lockerNumber')}</th>
                  <th className="p-3 text-start">{ct('lockers.withWhom')}</th>
                  <th className="p-3 text-start">{ct('lockers.mainBranch')}</th>
                  <th className="p-3 text-start">{ct('lockers.availability')}</th>
                  <th className="p-3 text-start">{ct('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(lockers ?? []).filter((locker) => !splitByGender || (locker.section ?? 'shared') === 'shared').length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{ct('lockers.emptyLockers')}</td></tr>
                )}
                {(lockers ?? []).filter((locker) => !splitByGender || (locker.section ?? 'shared') === 'shared').map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3">
                      <button type="button" className="nums font-semibold text-primary underline-offset-4 hover:underline" onClick={() => void openLockerDetail(l.id)}>
                        <span dir="ltr">{l.locker_number}</span>
                      </button>
                    </td>
                    <td className="p-3">
                      {l.current_holder ? (
                        <span>
                          <span className="font-medium">{l.current_holder.member_name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground nums">
                            {l.current_holder.source === 'handoff'
                              ? formatDateTime(l.current_holder.since, locale)
                              : toArabicDigits(l.current_holder.since)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{ct('lockers.nobodyHolding')}</span>
                      )}
                    </td>
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
                          title={ct('lockers.bookingHistory')}
                          aria-label={ct('lockers.bookingHistory')}
                          onClick={() => void openLockerDetail(l.id)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        {canDelete && <Button variant="ghost" size="icon" className="text-destructive" aria-label={ct('common.delete')} onClick={() => void removeLocker(l.id)}>
                          <Trash2 className="size-4" />
                        </Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : null}
        </TabsContent>

        <TabsContent value="types" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(lockerTypes ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground nums">
                    {toArabicDigits(t.meta_value)} · {toArabicDigits(t.days)} {ct('lockers.days')}
                  </p>
                </div>
                {(canUpdateType || canDeleteType) && <div className="flex gap-1">
                  {canUpdateType && <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTypeEditId(t.id);
                      setTypeForm({ name: t.name, metaValue: String(t.meta_value), days: String(t.days) });
                      setTypeOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>}
                  {canDeleteType && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeType(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>}
                </div>}
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
            {canCreate && <Button permissionAction="create" variant="brand" onClick={() => void save()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lockerOpen} onOpenChange={setLockerOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('lockers.addLocker')}</DialogTitle></DialogHeader>
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
            {canCreate && <Button permissionAction="create" variant="brand" onClick={() => void saveLocker()} disabled={saving}>{ct('common.save')}</Button>}
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
            {(typeEditId ? canUpdateType : canCreateType) && <Button permissionResource="club.lockers.settings" permissionAction={typeEditId ? 'update' : 'create'} variant="brand" onClick={() => void saveType()} disabled={saving}>{ct('common.save')}</Button>}
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
                  {formatDigits(lockerDetail.lockerNumber)}
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
                <h4 className="text-sm font-semibold">{ct('lockers.holdingNow')}</h4>
                {lockerDetail.currentHandoff ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
                    <div>
                      <p className="font-semibold">{lockerDetail.currentHandoff.memberName}</p>
                      <p className="text-sm text-muted-foreground nums">
                        {ct('lockers.receivedAt')} {formatDateTime(lockerDetail.currentHandoff.assignedAt, locale)}
                      </p>
                    </div>
                    {canUpdate ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void releaseHeldLocker(lockerDetail.currentHandoff!.memberId, lockerDetail.id)}
                      >
                        {ui('إرجاع اللوكر')}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{ct('lockers.nobodyHolding')}</p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{ct('lockers.handoffHistory')}</h4>
                {(lockerDetail.handoffs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ct('lockers.noBookingHistory')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-start">{ct('lockers.customerName')}</th>
                          <th className="p-2 text-start">{ct('lockers.receivedAt')}</th>
                          <th className="p-2 text-start">{ct('lockers.returnedAt')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lockerDetail.handoffs?.map((handoff) => (
                          <tr key={handoff.id} className="border-t">
                            <td className="p-2 font-medium">{handoff.memberName}</td>
                            <td className="p-2 nums whitespace-nowrap">{formatDateTime(handoff.assignedAt, locale)}</td>
                            <td className="p-2 nums whitespace-nowrap">
                              {handoff.releasedAt ? formatDateTime(handoff.releasedAt, locale) : ct('lockers.stillHolding')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
