import type { ColumnDef } from '@tanstack/react-table';
import { MemberCell } from '@/components/club/member-cell';
import { Eye, Lock, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { PaidAmountField } from '@/components/club/paid-amount-field';
import { clubPaymentMethodLabel } from '@/components/club/club-payment-method-select';
import { calculateSubscriptionDiscount, type SubscriptionDiscountMode } from '@/components/club/subscription-discount-fields';
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
import { formatMoney, localToday } from '@/lib/formatters';
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
  ClubDiscountCode,
  ClubMemberListItem,
} from '@/types/club';
import type { EmployeeListItem } from '@/types/employees';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';


function addDaysLocal(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, (day ?? 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
  branch_id?: number | null;
  has_stop?: boolean;
  stop_days?: number | null;
  is_target_based?: boolean;
}

interface LockerSubscriptionPrefill {
  branchId: number;
  gender: 'male' | 'female';
  memberCode: string;
  name: string;
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
  const location = useLocation();
  const lockerSubscriptionPrefill = location.state as LockerSubscriptionPrefill | null;
  const qc = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubLockerListItem>(
    'club-locker-subscriptions',
    params,
  );
  const { data: branches } = useBranches();
  const { data: lockerTypes, refetch: refetchTypes } = useArrayResource<LockerTypeRow>('club-locker-types');
  const { data: lockers } = useArrayResource<LockerRow>('club-lockers');
  const { data: discountCodes = [] } = useArrayResource<ClubDiscountCode>('club-discount-codes');
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'locker-subscriptions'],
    queryFn: async () => (await api.get<Pick<EmployeeListItem, 'id' | 'employee' | 'emp_code'>[]>('/employees/subscription-options')).data ?? [],
  });
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
    { key: 'gender', label: 'الفئة', type: 'select', options: [{ value: 'male', label: 'رجالي' }, { value: 'female', label: 'حريمي' }] },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
  ];

  const [tab, setTab] = useState<ClubLockersView>(singleView ?? 'subscriptions');
  const [freezeState, setFreezeState] = useState<{ id: number | null; days: string; preview: string | null }>({
    id: null,
    days: '7',
    preview: null,
  });
  const [dialogOpen, setDialogOpen] = useState(!!openSubOnMount || !!lockerSubscriptionPrefill);
  const [lockerOpen, setLockerOpen] = useState(!!openLockerOnMount);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeEditId, setTypeEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lockerDetail, setLockerDetail] = useState<ClubLockerDetails | null>(null);
  const [subscriptionDetail, setSubscriptionDetail] = useState<ClubLockerListItem | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<ClubLockerListItem | null>(null);
  const [editForm, setEditForm] = useState({
    customerName: '',
    startDate: '',
    endDate: '',
    gender: 'male' as 'male' | 'female',
    employeeId: '',
  });
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [paidAmountEdited, setPaidAmountEdited] = useState(false);

  const [form, setForm] = useState({
    mainBranchId: lockerSubscriptionPrefill?.branchId ?? 0,
    subBranchId: lockerSubscriptionPrefill?.branchId ?? 0,
    memberCode: lockerSubscriptionPrefill?.memberCode ?? '',
    customerName: lockerSubscriptionPrefill?.name ?? '',
    subscriptionTypeId: '',
    lockerId: '',
    paidAmount: '',
    discountMode: 'none' as SubscriptionDiscountMode,
    discountValue: '',
    discountCodeId: '',
    memberDiscountGrantId: '',
    pointsToRedeem: '',
    paymentMethod: 'cash',
    gender: lockerSubscriptionPrefill?.gender ?? 'male',
    recommendedEmployeeId: '',
    receiptNumber: '',
    subscriptionStartDate: localToday(),
  });
  const [lockerForm, setLockerForm] = useState({
    lockerNumber: '',
    mainBranchId: 0,
    subBranchId: 0,
  });
  const [typeForm, setTypeForm] = useState({ name: '', metaValue: '', days: '', branchId: '', hasStop: false, stopDays: '', isTargetBased: false });

  const { data: pointsAccount } = useQuery({
    queryKey: ['club-points', 'locker-subscription-account', selectedMember?.id],
    enabled: dialogOpen && selectedMember?.id != null,
    queryFn: async () => (await api.get<{ points: number; conversion: { points: number; value: number } | null }>(`/club-points/members/${selectedMember!.id}`)).data,
  });
  const { data: memberDiscountGrants = [] } = useQuery({
    queryKey: ['club-discount-codes', 'locker-member-grants', selectedMember?.id],
    enabled: dialogOpen && selectedMember?.id != null,
    queryFn: async () => (await api.get<Array<{ id: number; code: string | null; percentage: number; used: boolean; expiresOn: string | null }>>('/club-discount-codes/member-grants', { params: { memberId: selectedMember!.id } })).data
      .filter((grant) => !grant.used && !!grant.code && (!grant.expiresOn || grant.expiresOn >= localToday())),
  });
  const availableLockers = (lockers ?? []).filter((l) => l.is_available && l.main_branch_id === form.mainBranchId);
  const visibleLockerTypes = (lockerTypes ?? []).filter((type) => type.branch_id == null || type.branch_id === form.mainBranchId);
  const selectedType = visibleLockerTypes.find((t) => String(t.id) === form.subscriptionTypeId);
  const referencePrice = selectedType?.meta_value ?? 0;
  const discountAmount = calculateSubscriptionDiscount(
    referencePrice,
    form.discountMode,
    memberDiscountGrants.map((grant) => ({ id: grant.id, code: grant.code ?? '', percentage: grant.percentage, isActive: true, usageCount: 0, createdAt: '', updatedAt: '' })),
    form.memberDiscountGrantId,
    form.discountValue,
    form.pointsToRedeem,
    pointsAccount?.conversion ?? null,
  );
  const netDue = Math.max(0, referencePrice - discountAmount);
  const remainingDue = Math.max(0, netDue - (Number(form.paidAmount) || 0));
  const subscriptionEndDate = selectedType
    ? addDaysLocal(form.subscriptionStartDate, selectedType.days)
    : '';

  useEffect(() => {
    if (paidAmountEdited) return;
    setForm((current) => current.paidAmount === String(netDue)
      ? current
      : { ...current, paidAmount: String(netDue) });
  }, [netDue, paidAmountEdited]);

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

  const openSubscriptionEdit = (subscription: ClubLockerListItem) => {
    setEditingSubscription(subscription);
    setEditForm({
      customerName: subscription.customerName,
      startDate: subscription.subscriptionStartDate,
      endDate: subscription.subscriptionEndDate,
      gender: subscription.gender === 'female' ? 'female' : 'male',
      employeeId: subscription.recommendedEmployeeId != null ? String(subscription.recommendedEmployeeId) : '',
    });
  };

  const saveSubscriptionEdit = async () => {
    if (!editingSubscription) return;
    if (!editForm.customerName.trim() || !editForm.startDate || !editForm.endDate || editForm.endDate < editForm.startDate) {
      toast.error('أدخل اسم العميل وتواريخ اشتراك صحيحة');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/club-locker-subscriptions/${editingSubscription.id}`, {
        customerName: editForm.customerName.trim(),
        subscriptionStartDate: editForm.startDate,
        subscriptionEndDate: editForm.endDate,
        gender: editForm.gender,
        recommendedEmployeeId: editForm.employeeId ? Number(editForm.employeeId) : null,
      });
      toast.success('تم تعديل اشتراك اللوكر');
      setEditingSubscription(null);
      void refetch();
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
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
    setSelectedMember(null);
    setPaidAmountEdited(false);
    setForm({
      mainBranchId: branches?.[0]?.id ?? 0,
      subBranchId: branches?.[0]?.id ?? 0,
      memberCode: '',
      customerName: '',
      subscriptionTypeId: '',
      lockerId: '',
      paidAmount: '',
      discountMode: 'none',
      discountValue: '',
      discountCodeId: '',
      memberDiscountGrantId: '',
      pointsToRedeem: '',
      paymentMethod: 'cash',
      gender: 'male',
      recommendedEmployeeId: '',
      receiptNumber: '',
      subscriptionStartDate: localToday(),
    });
    setDialogOpen(true);
    // Fetch next sequential receipt number from backend
    void api.get<{ number: string }>('/club-receipts/next-number')
      .then(({ data }) => setForm((f) => ({ ...f, receiptNumber: data.number })))
      .catch(() => { /* silent — number stays blank */ });
  };

  const save = async () => {
    // Employee is optional; name the exact missing field instead of a generic message.
    if (!form.customerName.trim()) {
      toast.error('اختر العميل أولاً');
      return;
    }
    if (!form.subscriptionTypeId) {
      toast.error('اختر نوع الاشتراك');
      return;
    }
    if (!form.lockerId) {
      toast.error('اختر رقم اللوكر');
      return;
    }
    if (form.discountMode === 'code' && (!selectedMember || !form.memberDiscountGrantId)) {
      toast.error('اختر عضوًا وكود خصم ممنوحًا له');
      return;
    }
    if (form.discountMode === 'points' && (!selectedMember || !Number.isInteger(Number(form.pointsToRedeem)) || Number(form.pointsToRedeem) < 1)) {
      toast.error('اختر عضوًا وأدخل عدد نقاط صحيحًا للاستبدال');
      return;
    }
    setSaving(true);
    try {
      let memberId: number | undefined = selectedMember?.id;
      if (!memberId && form.memberCode.trim()) {
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
        discountEnabled: form.discountMode !== 'none' && form.discountMode !== 'points',
        discountValue: form.discountMode === 'fixed' || form.discountMode === 'percentage' ? discountAmount : 0,
        memberDiscountGrantId: form.discountMode === 'code' ? Number(form.memberDiscountGrantId) || undefined : undefined,
        pointsToRedeem: form.discountMode === 'points' ? Number(form.pointsToRedeem) || undefined : undefined,
        paymentMethod: form.paymentMethod,
        gender: form.gender,
        recommendedEmployeeId: form.recommendedEmployeeId ? Number(form.recommendedEmployeeId) : undefined,
        receiptNumber: form.receiptNumber.trim() || undefined,
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
        branchId: typeForm.branchId || undefined,
        hasStop: typeForm.hasStop,
        stopDays: typeForm.hasStop ? Number(typeForm.stopDays || 0) : undefined,
        isTargetBased: typeForm.isTargetBased,
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
      void qc.invalidateQueries({ queryKey: ['club-lockers'] });
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
      {
        id: 'customer', size: 210,
        header: ct('lockers.customerName'),
        cell: ({ row }) => (
          <MemberCell
            name={row.original.customerName}
            code={row.original.memberCode}
            memberId={row.original.memberId}
            profilePicture={row.original.memberProfilePicture}
            fallback={row.original.customerName}
          />
        ),
      },
      { accessorKey: 'subscriptionTypeName', size: 170, header: 'نوع الاشتراك', cell: ({ getValue }) => (getValue() as string | null) || '—' },
      { accessorKey: 'subscriptionStartDate', size: 95, header: 'بداية الاشتراك', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
      {
        accessorKey: 'subscriptionEndDate', size: 95,
        header: 'نهاية الاشتراك',
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      { accessorKey: 'lockerNumber', size: 70, header: 'رقم اللوكر', cell: ({ getValue }) => <span className="nums">{(getValue() as string | null) || '—'}</span> },
      { accessorKey: 'mainBranchId', size: 150, header: 'الفرع', cell: ({ getValue }) => branches?.find((branch) => branch.id === getValue())?.name ?? '—' },
      { accessorKey: 'recommendedEmployeeName', size: 110, header: 'الموظف', cell: ({ getValue }) => (getValue() as string | null) || '—' },
      { accessorKey: 'bookedByName', size: 110, header: 'القائم بالإضافة', cell: ({ getValue }) => (getValue() as string | null) || '—' },
      { accessorKey: 'paidAmount', size: 85, header: 'المدفوع', cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'paymentMethod', size: 85, header: 'طريقة الدفع', cell: ({ getValue }) => clubPaymentMethodLabel(ct, getValue() as string | null) },
      { accessorKey: 'receiptNumber', size: 90, header: 'رقم الإيصال', cell: ({ getValue }) => <span className="nums">{(getValue() as string | null) || '—'}</span> },
      {
        accessorKey: 'gender', size: 65,
        header: 'الفئة',
        cell: ({ getValue }) => getValue() === 'female' ? 'حريمي' : getValue() === 'male' ? 'رجالي' : '—',
      },
      {
        accessorKey: 'status',
        header: ct('common.status'), size: 85,
        cell: ({ row }) => {
          const map = { active: 'active', expired: 'expired', upcoming: 'pending' } as const;
          return <StatusBadge status={map[row.original.status]} />;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'), size: 60,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => afterMenuClose(() => setSubscriptionDetail(row.original))}>
                <Eye className="size-4" /> تفاصيل
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openSubscriptionEdit(row.original))}>
                <Pencil className="size-4" /> تعديل
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void release(row.original.id)}>{ct('lockers.release')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}>{ui('تجميد')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void doUnfreeze(row.original.id)}>{ui('إلغاء التجميد')}</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>
                <Trash2 className="size-4" /> حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [branches, ct, ui],
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
                setTypeForm({ name: '', metaValue: '', days: '', branchId: '', hasStop: false, stopDays: '', isTargetBased: false });
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
            compact
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
            <Button variant="outline" onClick={() => { setTypeEditId(null); setTypeForm({ name: '', metaValue: '', days: '', branchId: '', hasStop: false, stopDays: '', isTargetBased: false }); setTypeOpen(true); }}>
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
                      setTypeForm({ name: t.name, metaValue: String(t.meta_value), days: String(t.days), branchId: t.branch_id ? String(t.branch_id) : '', hasStop: !!t.has_stop, stopDays: t.stop_days ? String(t.stop_days) : '', isTargetBased: !!t.is_target_based });
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>الفرع</Label>
                <select
                  className={selectCls}
                  value={form.mainBranchId || ''}
                  onChange={(e) => {
                    const mainBranchId = Number(e.target.value);
                  setSelectedMember(null);
                    setForm((current) => ({ ...current, mainBranchId, subBranchId: mainBranchId, lockerId: '', subscriptionTypeId: '', memberCode: '', customerName: '' }));
                  }}
                >
                  <option value="">—</option>
                  {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>اسم العميل</Label>
                <MemberSearchCombobox
                  key={form.mainBranchId}
                  selectedMember={selectedMember}
                  branchId={form.mainBranchId}
                  forMembershipOperation
                  disabled={!form.mainBranchId}
                  onSelect={(member) => {
                    setSelectedMember(member);
                    setForm((current) => ({
                      ...current,
                      subscriptionTypeId: '',
                      lockerId: '',
                      customerName: member.name,
                      memberCode: member.memberCode,
                      gender: member.gender,
                    }));
                  }}
                  onClear={() => {
                    setSelectedMember(null);
                    setForm((current) => ({ ...current, customerName: '', memberCode: '' }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('lockers.subType')}</Label>
                <Combobox
                  value={form.subscriptionTypeId}
                  onValueChange={(v) => setForm((f) => ({ ...f, subscriptionTypeId: v }))}
                  options={visibleLockerTypes.map((t) => ({ value: String(t.id), label: t.name }))}
                  placeholder="—"
                />
              </div>
              <div className="grid gap-2">
                <Label>السعر</Label>
                <Input className="nums" readOnly value={referencePrice} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>عدد الأيام</Label>
                <Input className="nums" readOnly value={selectedType?.days ?? ''} />
              </div>
              <div className="grid gap-2">
                <Label>{ct('lockers.startDate')}</Label>
                <Input type="date" value={form.subscriptionStartDate} onChange={(e) => setForm((f) => ({ ...f, subscriptionStartDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>تاريخ النهاية</Label>
                <Input type="date" readOnly value={subscriptionEndDate} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>{ct('lockers.selectLocker')}</Label>
                <Combobox
                  value={form.lockerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, lockerId: v }))}
                  options={availableLockers.map((l) => ({ value: String(l.id), label: l.locker_number }))}
                  placeholder="—"
                />
              </div>
              <div className="grid gap-2">
                <Label>الفئة</Label>
                <select className={selectCls} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as LockerSubscriptionPrefill['gender'] }))}>
                  <option value="male">رجالي</option>
                  <option value="female">حريمي</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>الموظف (اختياري)</Label>
                <Combobox
                  value={form.recommendedEmployeeId}
                  onValueChange={(v) => setForm((f) => ({ ...f, recommendedEmployeeId: v }))}
                  options={employees.map((e) => ({ value: String(e.id), label: e.employee ?? '—', searchText: String(e.emp_code ?? '') }))}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>حالة الخصم</Label>
                <select className={selectCls} value={form.discountMode} onChange={(e) => setForm((current) => ({ ...current, discountMode: e.target.value as SubscriptionDiscountMode, discountValue: '', discountCodeId: '', memberDiscountGrantId: '', pointsToRedeem: '' }))}>
                  <option value="none">بدون خصم</option>
                  <option value="fixed">مبلغ</option>
                  <option value="percentage">نسبة</option>
                  <option value="code">كود خصم</option>
                  <option value="points">خصم نقاط</option>
                </select>
              </div>
              {form.discountMode === 'fixed' && (
                <div className="grid gap-2"><Label>قيمة الخصم</Label><Input className="nums" type="number" min="0" max={referencePrice} value={form.discountValue} onChange={(e) => setForm((current) => ({ ...current, discountValue: e.target.value }))} /></div>
              )}
              {form.discountMode === 'percentage' && (
                <div className="grid gap-2"><Label>نسبة الخصم</Label><Input className="nums" type="number" min="0" max="100" value={form.discountValue} onChange={(e) => setForm((current) => ({ ...current, discountValue: e.target.value }))} /></div>
              )}
              {form.discountMode === 'code' && (
                <div className="grid gap-2"><Label>كود الخصم الممنوح للعضو</Label><select className={selectCls} value={form.memberDiscountGrantId} onChange={(e) => setForm((current) => ({ ...current, memberDiscountGrantId: e.target.value }))}><option value="">—</option>{memberDiscountGrants.map((code) => <option key={code.id} value={code.id}>{code.code} — {code.percentage}%</option>)}</select>{!memberDiscountGrants.length ? <p className="text-xs text-muted-foreground">لا توجد أكواد خصم صالحة ممنوحة للعضو.</p> : null}</div>
              )}
              {form.discountMode === 'points' && (
                <div className="grid gap-2"><Label>النقاط المستخدمة</Label><Input className="nums" type="number" min="1" max={pointsAccount?.points || undefined} value={form.pointsToRedeem} onChange={(e) => setForm((current) => ({ ...current, pointsToRedeem: e.target.value }))} /><p className="text-xs text-muted-foreground">الرصيد: {toArabicDigits(pointsAccount?.points ?? 0)} نقطة</p></div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <PaidAmountField
                label={ct('lockers.paidAmount')}
                value={form.paidAmount}
                max={netDue > 0 ? netDue : undefined}
                onChange={(paidAmount) => {
                  setPaidAmountEdited(true);
                  setForm((current) => ({ ...current, paidAmount }));
                }}
              />
              <div className="grid gap-2"><Label>{ct('common.remaining')}</Label><Input className="nums" readOnly value={remainingDue} /></div>
              <div className="grid gap-2">
                <Label>{ct('common.paymentMethod')}</Label>
                <select className={selectCls} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="cash">{ct('common.cash')}</option>
                  <option value="card">{ct('common.card')}</option>
                  <option value="bank">{ct('common.bank')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.receiptNumber')}</Label>
                <Input className="nums text-muted-foreground" dir="ltr" readOnly value={form.receiptNumber} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subscriptionDetail !== null} onOpenChange={(open) => !open && setSubscriptionDetail(null)}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>تفاصيل اشتراك اللوكر</DialogTitle></DialogHeader>
          {subscriptionDetail && (
            <div className="max-h-[70vh] overflow-y-auto py-2">
              <LockerDetailRow label="رقم الاشتراك" value={subscriptionDetail.subscriptionNumber} nums />
              <LockerDetailRow label="اسم العميل" value={subscriptionDetail.customerName} />
              <LockerDetailRow label="نوع الاشتراك" value={subscriptionDetail.subscriptionTypeName ?? '—'} />
              <LockerDetailRow label="بداية الاشتراك" value={subscriptionDetail.subscriptionStartDate} nums />
              <LockerDetailRow label="نهاية الاشتراك" value={subscriptionDetail.subscriptionEndDate} nums />
              <LockerDetailRow label="رقم اللوكر" value={subscriptionDetail.lockerNumber ?? '—'} nums />
              <LockerDetailRow label="الفرع" value={branches?.find((branch) => branch.id === subscriptionDetail.mainBranchId)?.name ?? '—'} />
              <LockerDetailRow label="الفئة" value={subscriptionDetail.gender === 'female' ? 'حريمي' : subscriptionDetail.gender === 'male' ? 'رجالي' : '—'} />
              <LockerDetailRow label="الحالة" value={ct(`common.${subscriptionDetail.status}`)} />
              <LockerDetailRow label="الموظف" value={subscriptionDetail.recommendedEmployeeName ?? '—'} />
              <LockerDetailRow label="القائم بالإضافة" value={subscriptionDetail.bookedByName ?? '—'} />
              <LockerDetailRow label="المدفوع" value={formatMoney(subscriptionDetail.paidAmount)} nums />
              <LockerDetailRow label="طريقة الدفع" value={clubPaymentMethodLabel(ct, subscriptionDetail.paymentMethod)} />
              <LockerDetailRow label="رقم الإيصال" value={subscriptionDetail.receiptNumber ?? '—'} nums />
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setSubscriptionDetail(null)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingSubscription !== null} onOpenChange={(open) => !open && setEditingSubscription(null)}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>تعديل اشتراك اللوكر</DialogTitle></DialogHeader>
          {editingSubscription && (
            <div className="grid max-h-[70vh] gap-3 overflow-y-auto py-2 md:grid-cols-2">
              <div className="grid gap-2"><Label>رقم الاشتراك</Label><Input readOnly value={editingSubscription.subscriptionNumber} /></div>
              <div className="grid gap-2"><Label>نوع الاشتراك</Label><Input readOnly value={editingSubscription.subscriptionTypeName ?? '—'} /></div>
              <div className="grid gap-2"><Label>رقم اللوكر</Label><Input readOnly value={editingSubscription.lockerNumber ?? '—'} /></div>
              <div className="grid gap-2"><Label>الفرع</Label><Input readOnly value={branches?.find((branch) => branch.id === editingSubscription.mainBranchId)?.name ?? '—'} /></div>
              <div className="grid gap-2"><Label>اسم العميل</Label><Input value={editForm.customerName} onChange={(event) => setEditForm((form) => ({ ...form, customerName: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>الفئة</Label><select className={selectCls} value={editForm.gender} onChange={(event) => setEditForm((form) => ({ ...form, gender: event.target.value as 'male' | 'female' }))}><option value="male">رجالي</option><option value="female">حريمي</option></select></div>
              <div className="grid gap-2"><Label>بداية الاشتراك</Label><Input type="date" value={editForm.startDate} onChange={(event) => setEditForm((form) => ({ ...form, startDate: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>نهاية الاشتراك</Label><Input type="date" value={editForm.endDate} onChange={(event) => setEditForm((form) => ({ ...form, endDate: event.target.value }))} /></div>
              <div className="grid gap-2 md:col-span-2"><Label>الموظف</Label><select className={selectCls} value={editForm.employeeId} onChange={(event) => setEditForm((form) => ({ ...form, employeeId: event.target.value }))}><option value="">بدون موظف</option>{editingSubscription.recommendedEmployeeId != null && !employees.some((employee) => employee.id === editingSubscription.recommendedEmployeeId) && <option value={editingSubscription.recommendedEmployeeId}>{editingSubscription.recommendedEmployeeName ?? `موظف #${editingSubscription.recommendedEmployeeId}`}</option>}{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee ?? `موظف #${employee.id}`}</option>)}</select></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSubscription(null)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveSubscriptionEdit()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
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
            <select className={selectCls} value={typeForm.branchId} onChange={(e) => setTypeForm((f) => ({ ...f, branchId: e.target.value }))}><option value="">كل الفروع</option>{branchOptions.map((branch) => <option key={branch.value} value={branch.value}>{branch.label}</option>)}</select>
            <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.hasStop} onChange={(e) => setTypeForm((f) => ({ ...f, hasStop: e.target.checked }))} />يسمح بالوقف</label>
            {typeForm.hasStop && <Input type="number" min="1" placeholder="عدد أيام الوقف" value={typeForm.stopDays} onChange={(e) => setTypeForm((f) => ({ ...f, stopDays: e.target.value }))} />}
            <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.isTargetBased} onChange={(e) => setTypeForm((f) => ({ ...f, isTargetBased: e.target.checked }))} />تابع للتارجت</label>
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
