import type { ColumnDef } from '@tanstack/react-table';
import { useLocation } from 'react-router-dom';
import {
  CreditCard,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Snowflake,
  Sun,
  Undo2,
  Printer,
  User,
  CalendarDays,
  Wallet,
  ShieldOff,
  Dumbbell,
  Package,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { DialogFormGrid, DialogFormSection, DialogFormSummary, FormDialogBody, FormDialogFooter, FormDialogHeader, FORM_DIALOG_CONTENT_CLASS } from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import {
  MemberOnboardingGuide,
  useFirstVisitGuide,
} from '@/components/club/member-onboarding-guide';
import { SubscriptionTypeSelect, TransferPlanPicker } from '@/components/club/subscription-type-select';
import { SubscriptionInvoicePrint } from '@/components/club/subscription-invoice-print';
import {
  ClubPaymentMethodSelect,
  clubPaymentMethodsLabel,
  type ClubPaymentMethod,
} from '@/components/club/club-payment-method-select';
import {
  buildClubPaymentSplit,
  ClubPaymentSplitFields,
  singlePaymentRow,
  type ClubPaymentSplitRow,
} from '@/components/club/club-payment-split-fields';
import { SubscriptionRefundsWorkspace } from '@/pages/club/subscription-refunds';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
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
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { translateNavRoute } from '@/lib/nav';
import { api, apiError } from '@/lib/api';
import { formatMoney, formatTime, localToday } from '@/lib/formatters';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, confirmWithPreview, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionsView } from '@/lib/club-routes';
import type { ClubMemberListItem, ClubSubscriptionListItem, ClubSubscriptionStatistics, ClubSubscriptionType } from '@/types/club';
import type { ClubClassType } from '@/types/fitness';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
  userBranchId?: number,
): string {
  if (!branchId) return '—';
  const name = branches?.find((b) => b.id === branchId)?.name?.trim();
  if (name) return name;
  if (userBranchId === branchId) return branches === undefined ? '…' : '—';
  return branches === undefined ? '…' : '—';
}

/** Add N days to a YYYY-MM-DD string using local time (no UTC shift). */
function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function daysBetweenLocal(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = Date.UTC(sy, (sm ?? 1) - 1, sd ?? 1);
  const end = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1);
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

interface ReceiptRow extends SubscriptionPaymentReceiptRow {
  memberName: string;
  subscriptionId?: number | null;
}

interface WaiverReportRow {
  id: number;
  subscriptionId: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  memberName: string | null;
  amount: number;
  waiverDate: string;
  reason: string | null;
}

type SubscriptionKind = 'package' | 'sessions' | 'special';

export interface ClubSubscriptionsPageProps {
  singleView?: ClubSubscriptionsView;
  openCreateOnMount?: boolean;
  filterSpecial?: boolean;
  filterTimeBased?: boolean;
  reportFocus?: 'expired' | 'outstanding' | 'expiring';
}

export function ClubSubscriptionsPage({
  singleView,
  openCreateOnMount,
  filterSpecial,
  filterTimeBased,
  reportFocus,
}: ClubSubscriptionsPageProps = {}) {
  const ct = useClubT();
  const { ui, t } = useLocale();
  const { can } = usePermission();
  const canCreateSubscriptions =
    can('club.subscriptions:create') ||
    can('club.subscriptions.list:create') ||
    can('club.subscriptions.new:create');
  const canUpdateSubscriptions =
    can('club.subscriptions:update') ||
    can('club.subscriptions.list:update');
  const canDeleteSubscriptions =
    can('club.subscriptions:delete') ||
    can('club.subscriptions.list:delete');
  const canPrintSubscriptions =
    can('club.subscriptions:print') ||
    can('club.subscriptions.list:print');
  const { user } = useAuth();
  const subscriptionOnboarding = useFirstVisitGuide('subscriptions', user?.sub);
  const qc = useQueryClient();
  const location = useLocation();
  const initialFilters: Record<string, string> | undefined = filterSpecial
    ? { isSpecial: 'true' }
    : filterTimeBased
      ? { isTimeBased: 'true' }
      : undefined;
  const { params, setParams } = useListQuery(initialFilters ? { filters: initialFilters } : undefined);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    params,
  );
  const { data: branches } = useBranches();
  const { data: subTypesRaw, refetch: refetchTypes } = useArrayResource<{
    id: number;
    name: string;
    price: number;
    days: number;
    isSpecialOffer?: boolean;
    applyToAllBranches?: boolean;
    branchIds?: number[];
    branchId?: number | null;
    isLinkedToSessions?: boolean;
    sessionsCount?: number | null;
  }>('club-subscription-types');
  const { data: specialClassTypes } = useArrayResource<ClubClassType>('club-class-types');
  const [walkIn, setWalkIn] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const showNewSubButton = !singleView || singleView === 'subs';
  const { data: receipts, refetch: refetchReceipts } = useArrayResource<ReceiptRow>('club-receipts');
  const { data: transfers, refetch: refetchTransfers } = useArrayResource<{
    id: number;
    subscription_id: number;
    from_subscription_type: string | null;
    to_subscription_type: string;
    transfer_date: string;
    to_value: number;
  }>('club-subscription-transfers');

  const { data: stats } = useQuery({
    queryKey: ['club-subscriptions', 'statistics', filterSpecial ? 'special' : 'all'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubSubscriptionStatistics>('/club-subscriptions/statistics', {
        params: filterSpecial ? { isSpecial: 'true' } : undefined,
      });
      return s;
    },
  });

  const { data: expired } = useQuery({
    queryKey: ['club-subscriptions', 'expired'],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; count: number }>(
        '/club-subscriptions/expired-report',
      );
      return r;
    },
  });

  // Subscriptions expiring within the next 7 days (uses endDateFrom/endDateTo range).
  const expiringRange = useMemo(() => {
    const from = localToday();
    const to = addDaysLocal(from, 7);
    return { from, to };
  }, []);
  const { data: expiring } = useQuery({
    queryKey: ['club-subscriptions', 'expiring', expiringRange.from, expiringRange.to],
    enabled: reportFocus === 'expiring',
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; total: number }>(
        '/club-subscriptions',
        {
          params: {
            endDateFrom: expiringRange.from,
            endDateTo: expiringRange.to,
            status: 'active',
            pageSize: 100,
          },
        },
      );
      return r;
    },
  });

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ct('common.active') },
      { value: 'expired', label: ct('common.expired') },
      { value: 'upcoming', label: ct('common.upcoming') },
      { value: 'frozen', label: ct('subscriptions.frozen') },
    ],
    [ct],
  );
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const subTypeOptions = (subTypesRaw ?? [])
    .map((t) => ({ value: t.name, label: t.name }))
    .filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i);
  const genderOptions = [
    { value: 'male', label: ct('common.male') },
    { value: 'female', label: ct('common.female') },
  ];
  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'subscriptionType', label: ct('subscriptions.subType'), type: 'select', options: subTypeOptions },
    { key: 'gender', label: ct('common.gender'), type: 'select', options: genderOptions },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
  ];

  const [tab, setTab] = useState<ClubSubscriptionsView>(
    singleView ?? (reportFocus ? 'reports' : 'subs'),
  );
  const { data: outstanding, refetch: refetchOutstanding } = useQuery({
    queryKey: ['club-subscriptions', 'outstanding'],
    queryFn: async () => {
      const { data: r } = await api.get<{ subscriptions: ClubSubscriptionListItem[]; summary: { count: number } }>(
        '/club-subscriptions/outstanding-report',
      );
      return r;
    },
    enabled: reportFocus === 'outstanding' || tab === 'reports',
  });
  const { data: waivers, refetch: refetchWaivers } = useQuery({
    queryKey: ['club-subscriptions', 'waivers'],
    queryFn: async () => (await api.get<{ data: WaiverReportRow[]; summary: { count: number; totalAmount: number } }>('/club-subscriptions/waivers-report')).data,
    enabled: tab === 'waivers',
  });
  const [dialogOpen, setDialogOpen] = useState(!!openCreateOnMount);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editOriginal, setEditOriginal] = useState<{ startDate: string; typeId: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printSub, setPrintSub] = useState<ClubSubscriptionListItem | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installmentRows, setInstallmentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [paymentMaxRemaining, setPaymentMaxRemaining] = useState(0);
  const [paymentSub, setPaymentSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverSub, setWaiverSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverForm, setWaiverForm] = useState({ amount: '', reason: '' });
  const [editRemainingAmount, setEditRemainingAmount] = useState<number | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState({ paidAmount: '' });
  const [renewRows, setRenewRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [subscriptionKind, setSubscriptionKind] = useState<SubscriptionKind>('package');
  /** Tender rows for the create/edit dialog — one row unless the user splits the payment. */
  const [paymentRows, setPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());

  const [form, setForm] = useState({
    branchId: 0,
    memberId: '',
    customerName: '',
    subscriptionTypeId: '',
    specialClassTypeId: '',
    startDate: localToday(),
    endDate: '',
    subscriptionValue: '',
    paidAmount: '',
    gender: 'male' as 'male' | 'female',
    isSpecial: false,
    isTimeBased: false,
    timeFrom: '06:00',
    timeTo: '22:00',
    discountEnabled: false,
    discountValue: '',
    isLinkedToSessions: false,
    sessionsCount: '',
    validityDays: '',
  });

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId, user?.branch),
    [branches, form.branchId, user?.branch],
  );
  const historySubId =
    paymentOpen && selectedId != null
      ? selectedId
      : dialogOpen && editSubId != null
        ? editSubId
        : // The printed invoice lists the tender breakdown, which lives on the receipts.
          (printSub?.id ?? null);

  const { data: subscriptionReceipts = [], isLoading: loadingSubscriptionReceipts } = useQuery({
    queryKey: ['club-receipts', 'by-subscription', historySubId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReceiptRow[] }>('/club-receipts', {
        params: { subscriptionId: historySubId, pageSize: 100, page: 1 },
      });
      return data.data ?? [];
    },
    enabled: historySubId != null,
  });

  const formNetValue = useMemo(() => {
    const value = Number(form.subscriptionValue) || 0;
    const discount = form.discountEnabled ? Number(form.discountValue) || 0 : 0;
    return Math.max(0, value - discount);
  }, [form.subscriptionValue, form.discountEnabled, form.discountValue]);
  const formRemaining = useMemo(() => {
    const paid = Number(form.paidAmount) || 0;
    return Math.max(0, formNetValue - paid);
  }, [formNetValue, form.paidAmount]);
  const availableSubTypes = useMemo(() => {
    let types = (subTypesRaw ?? []).filter((type) => !type.isSpecialOffer);
    const branchId = form.branchId || selectedMember?.branchId;
    if (branchId) {
      types = types.filter((type) => {
        if (type.applyToAllBranches) return true;
        if (type.branchIds?.includes(branchId)) return true;
        return type.branchId === branchId;
      });
    }
    return types;
  }, [subTypesRaw, form.branchId, selectedMember?.branchId]);
  const subTypes = useMemo(
    () => availableSubTypes.filter((type) =>
      subscriptionKind === 'sessions' ? !!type.isLinkedToSessions : !type.isLinkedToSessions,
    ),
    [availableSubTypes, subscriptionKind],
  );
  const [receiptForm, setReceiptForm] = useState({ memberName: '', amount: '', memberCode: '', subscriptionId: '' });
  const [transferForm, setTransferForm] = useState({
    subscriptionId: '',
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    toEndDate: '',
    toValue: '',
  });

  const pageTitle = filterSpecial
    ? translateNavRoute(t, '/club/subscriptions/special')
    : filterTimeBased
      ? translateNavRoute(t, '/club/subscriptions/time-based')
      : ct('subscriptions.title');

  useEffect(() => {
    if (filterSpecial) setParams({ filters: { isSpecial: 'true' }, page: 1 });
    else if (filterTimeBased) setParams({ filters: { isTimeBased: 'true' }, page: 1 });
  }, [filterSpecial, filterTimeBased, setParams]);

  // Arriving from the member form's «حفظ وإضافة اشتراك»: preselect that member and open the dialog.
  useEffect(() => {
    const prefill = (location.state as { prefillMember?: ClubMemberListItem } | null)?.prefillMember;
    if (!prefill) return;
    window.history.replaceState({}, '');
    setEditSubId(null);
    setWalkIn(false);
    setSelectedMember(prefill);
    const branchId =
      (user?.branch && user.branch > 0 ? user.branch : undefined) ??
      prefill.branchId ??
      branches?.[0]?.id ??
      0;
    setForm((f) => ({
      ...f,
      memberId: String(prefill.id),
      customerName: prefill.name,
      gender: prefill.gender ?? f.gender,
      branchId,
    }));
    setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock branch to the logged-in employee when the create dialog opens empty.
  useEffect(() => {
    if (!dialogOpen || editSubId) return;
    if (form.branchId) return;
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    if (!branchId) return;
    setForm((f) => (f.branchId ? f : { ...f, branchId }));
  }, [dialogOpen, editSubId, form.branchId, user?.branch, branches]);

  useEffect(() => {
    if (!form.subscriptionTypeId || !form.startDate) return;
    const type = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
    if (!type) return;
    setForm((f) => ({
      ...f,
      subscriptionValue: String(type.price),
      isLinkedToSessions: !!type.isLinkedToSessions,
      sessionsCount: type.isLinkedToSessions && type.sessionsCount != null ? String(type.sessionsCount) : '',
      endDate: addDaysLocal(f.startDate, type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0),
    }));
  }, [form.subscriptionTypeId, form.startDate, subTypes]);

  useEffect(() => {
    if (!form.specialClassTypeId || !form.startDate) return;
    const classType = specialClassTypes?.find((item) => item.id === Number(form.specialClassTypeId));
    if (!classType) return;
    setForm((current) => ({
      ...current,
      validityDays:
        Number.isInteger(Number(current.validityDays)) && Number(current.validityDays) > 0
          ? current.validityDays
          : '30',
      subscriptionValue: String(
        classType.singleSessionPrice *
          (Number.isInteger(Number(current.sessionsCount)) && Number(current.sessionsCount) > 0
            ? Number(current.sessionsCount)
            : 1),
      ),
      sessionsCount:
        Number.isInteger(Number(current.sessionsCount)) && Number(current.sessionsCount) > 0
          ? current.sessionsCount
          : '1',
      endDate: addDaysLocal(
        current.startDate,
        Number.isInteger(Number(current.validityDays)) && Number(current.validityDays) > 0
          ? Number(current.validityDays)
          : 30,
      ),
      isSpecial: true,
      isLinkedToSessions: true,
    }));
  }, [form.specialClassTypeId, form.startDate, specialClassTypes]);

  useEffect(() => {
    if (!transferForm.toSubscriptionTypeId || !transferForm.toStartDate) return;
    const type = availableSubTypes.find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    setTransferForm((f) => ({
      ...f,
      toEndDate: addDaysLocal(
        f.toStartDate,
        type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0,
      ),
      toValue: String(type.price),
    }));
  }, [transferForm.toSubscriptionTypeId, transferForm.toStartDate, availableSubTypes]);

  const invalidateAll = () => {
    void refetch();
    void refetchReceipts();
    void refetchTransfers();
    void refetchTypes();
    void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    void qc.invalidateQueries({ queryKey: ['club-subscriptions', 'outstanding'] });
  };

  const selectSubscriptionKind = (kind: SubscriptionKind) => {
    if (editSubId) return;
    setSubscriptionKind(kind);
    setForm((current) => ({
      ...current,
      subscriptionTypeId: '',
      specialClassTypeId: '',
      subscriptionValue: '',
      endDate: '',
      paidAmount: kind === 'special' ? '' : current.paidAmount,
      isSpecial: kind === 'special',
      isLinkedToSessions: kind === 'sessions',
      sessionsCount: kind === 'special' ? '1' : '',
      validityDays: kind === 'special' ? '30' : '',
    }));
    if (kind === 'special') {
      setWalkIn(false);
      if (!form.memberId) setSelectedMember(null);
    }
  };

  const openCreate = () => {
    if (!canCreateSubscriptions) return;
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    setEditSubId(null);
    setSubscriptionKind('package');
    setForm({
      branchId,
      memberId: '',
      customerName: '',
      subscriptionTypeId: '',
      specialClassTypeId: '',
      startDate: localToday(),
      endDate: '',
      subscriptionValue: '',
      paidAmount: '',
      gender: 'male',
        isSpecial: false,
      isTimeBased: false,
      timeFrom: '06:00',
      timeTo: '22:00',
      discountEnabled: false,
      discountValue: '',
      isLinkedToSessions: false,
      sessionsCount: '',
      validityDays: '',
    });
    setPaymentRows(singlePaymentRow());
    setEditRemainingAmount(null);
    setWalkIn(false);
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: ClubSubscriptionListItem) => {
    if (!canUpdateSubscriptions) return;
    setEditSubId(row.id);
    setSubscriptionKind(row.specialClassTypeId || row.isSpecial ? 'special' : row.isLinkedToSessions ? 'sessions' : 'package');
    setPaymentRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash'));
    setForm({
      branchId: row.branchId ?? branches?.[0]?.id ?? 0,
      memberId: row.memberId ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      subscriptionTypeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
      specialClassTypeId: row.specialClassTypeId ? String(row.specialClassTypeId) : '',
      startDate: row.subscriptionStartDate,
      endDate: row.subscriptionEndDate,
      subscriptionValue: String(row.subscriptionValue ?? ''),
      paidAmount: String(row.paidAmount ?? ''),
      gender: (row.gender as 'male' | 'female') ?? 'male',
      isSpecial: !!row.isSpecial,
      isTimeBased: !!row.isTimeBased,
      timeFrom: row.timeFrom ?? '06:00',
      timeTo: row.timeTo ?? '22:00',
      discountEnabled: !!row.discountEnabled,
      discountValue: row.discountValue ? String(row.discountValue) : '',
      isLinkedToSessions: !!row.isLinkedToSessions,
      sessionsCount: row.sessionsCount ? String(row.sessionsCount) : '',
      validityDays:
        row.specialClassTypeId || row.isSpecial
          ? String(daysBetweenLocal(row.subscriptionStartDate, row.subscriptionEndDate))
          : '',
    });
    setEditRemainingAmount(row.remainingAmount);
    setWalkIn(!row.memberId);
    if (row.memberId) {
      try {
        const { data } = await api.get<ClubMemberListItem>(`/club-members/${row.memberId}`);
        setSelectedMember(data);
      } catch {
        setSelectedMember(null);
      }
    } else {
      setSelectedMember(null);
    }
    setEditOriginal({
      startDate: row.subscriptionStartDate,
      typeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
    });
    setDialogOpen(true);
  };

  const saveSub = async () => {
    if (editSubId ? !canUpdateSubscriptions : !canCreateSubscriptions) return;
    if (subscriptionKind === 'special' && (!selectedMember || !form.memberId)) {
      toast.error('اختر عضوًا مسجلًا لإضافة الاشتراك الخاص');
      return;
    }
    if (!form.customerName.trim() && !form.memberId) {
      toast.error(ct('subscriptions.customerName'));
      return;
    }
    if (subscriptionKind === 'special' ? !form.specialClassTypeId : !form.subscriptionTypeId) {
      toast.error(ct('subscriptions.subType'));
      return;
    }
    const specialSessionsCount = Number(form.sessionsCount);
    if (
      subscriptionKind === 'special' &&
      (!Number.isInteger(specialSessionsCount) || specialSessionsCount < 1)
    ) {
      toast.error('عدد الحصص يجب أن يكون رقمًا صحيحًا أكبر من صفر');
      return;
    }
    const specialValidityDays = Number(form.validityDays);
    if (
      subscriptionKind === 'special' &&
      (!Number.isInteger(specialValidityDays) || specialValidityDays < 1)
    ) {
      toast.error('مدة صلاحية الاشتراك يجب أن تكون رقمًا صحيحًا أكبر من صفر');
      return;
    }
    const effectiveBranchId =
      form.branchId ||
      (user?.branch && user.branch > 0 ? user.branch : undefined) ||
      selectedMember?.branchId ||
      branches?.[0]?.id;
    if (!effectiveBranchId) {
      toast.error(ct('common.branch'));
      return;
    }
    const employeeId = user?.emp_code ?? selectedMember?.employeeId ?? undefined;
    // Editing never collects money, so only the create paths carry a split to validate.
    const paidNow = editSubId ? 0 : Number(form.paidAmount) || 0;
    const split = buildClubPaymentSplit(paymentRows, paidNow, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    setSaving(true);
    try {
      if (subscriptionKind === 'special') {
        const specialPayload = {
          branchId: effectiveBranchId,
          memberId: Number(form.memberId),
          customerName: form.customerName || undefined,
          specialClassTypeId: Number(form.specialClassTypeId),
          sessionsCount: specialSessionsCount,
          validityDays: specialValidityDays,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: true,
        };
        if (editSubId) {
          await api.put(`/club-subscriptions/${editSubId}`, {
            ...specialPayload,
            subscriptionStartDate: form.startDate,
          });
        } else {
          await api.post('/club-subscriptions', {
            ...specialPayload,
            startDate: form.startDate,
            paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          });
        }
      } else if (editSubId) {
        const common = {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          paymentMethod: split.payload.paymentMethod,
          gender: form.gender,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: form.isSpecial,
          isTimeBased: form.isTimeBased,
          timeFrom: form.isTimeBased ? form.timeFrom : undefined,
          timeTo: form.isTimeBased ? form.timeTo : undefined,
          discountEnabled: form.discountEnabled,
          discountValue: form.discountEnabled && form.discountValue ? Number(form.discountValue) : 0,
          isLinkedToSessions: form.isLinkedToSessions,
          sessionsCount: form.isLinkedToSessions && form.sessionsCount ? Number(form.sessionsCount) : undefined,
        };
        const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
        const datesChanged =
          !!editOriginal &&
          (editOriginal.startDate !== form.startDate || editOriginal.typeId !== form.subscriptionTypeId);
        await api.put(`/club-subscriptions/${editSubId}`, {
          ...common,
          ...(datesChanged && selectedType
            ? {
                subscriptionStartDate: form.startDate,
                subscriptionEndDate: addDaysLocal(
                  form.startDate,
                  selectedType.days > 0 ? selectedType.days : selectedType.isLinkedToSessions ? 30 : 0,
                ),
                subscriptionType: selectedType.name,
                subscriptionValue: selectedType.price,
                isLinkedToSessions: !!selectedType.isLinkedToSessions,
                sessionsCount: selectedType.isLinkedToSessions
                  ? selectedType.sessionsCount ?? undefined
                  : undefined,
              }
            : {}),
        });
      } else {
        await api.post('/club-subscriptions', {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          startDate: form.startDate,
          paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          isSpecial: filterSpecial || form.isSpecial,
        });
      }
      toast.success(ct('common.success'));
      setDialogOpen(false);
      setEditSubId(null);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (sub: ClubSubscriptionListItem) => {
    setSelectedId(sub.id);
    setPaymentSub(sub);
    setPaymentMaxRemaining(sub.remainingAmount);
    setPaymentAmount('');
    setInstallmentRows(singlePaymentRow((sub.paymentMethod as ClubPaymentMethod) || 'cash'));
    setPaymentOpen(true);
  };

  const pay = async () => {
    if (!selectedId) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    if (paymentMaxRemaining > 0 && amount > paymentMaxRemaining) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    const split = buildClubPaymentSplit(installmentRows, amount, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    setSaving(true);
    try {
      const { data: result } = await api.patch<{
        subscription: ClubSubscriptionListItem;
        paymentAmount: number;
      }>(`/club-subscriptions/${selectedId}/payment`, {
        paymentAmount: amount,
        ...split.payload,
      });
      if (result.subscription) {
        setPaymentSub(result.subscription);
        setPaymentMaxRemaining(result.subscription.remainingAmount);
      }
      void qc.invalidateQueries({ queryKey: ['club-receipts', 'by-subscription', selectedId] });
      toast.success(ct('common.success'));
      setPaymentOpen(false);
      setPaymentSub(null);
      invalidateAll();
      void refetchOutstanding();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openWaiver = (sub: ClubSubscriptionListItem) => {
    setSelectedId(sub.id);
    setWaiverSub(sub);
    setWaiverForm({ amount: String(sub.remainingAmount), reason: '' });
    setWaiverOpen(true);
  };

  const waive = async () => {
    if (!selectedId || !waiverSub) return;
    const amount = Number(waiverForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > waiverSub.remainingAmount) {
      toast.error('أدخل مبلغ إعفاء صحيحًا لا يتجاوز المديونية');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/waiver`, {
        amount,
        reason: waiverForm.reason.trim() || undefined,
      });
      toast.success('تم تسجيل الإعفاء دون إنشاء أي حركة مالية');
      setWaiverOpen(false);
      setWaiverSub(null);
      invalidateAll();
      void refetchOutstanding();
      void refetchWaivers();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openRenew = (row: ClubSubscriptionListItem) => {
    setSelectedId(row.id);
    const net = subscriptionNetValue(row);
    setRenewForm({ paidAmount: String(net) });
    setRenewRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash', net));
    setRenewOpen(true);
  };

  const renewSub = useMemo(
    () => (renewOpen && selectedId != null ? (data?.data ?? []).find((s) => s.id === selectedId) ?? null : null),
    [renewOpen, selectedId, data?.data],
  );
  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  const submitRenew = async () => {
    if (!selectedId) return;
    const trimmed = renewForm.paidAmount.trim();
    const body: {
      paidAmount?: number;
      paymentMethod?: string;
      payments?: { method: string; amount: number }[];
    } = {};
    if (trimmed) {
      const amount = Number(trimmed);
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error(ct('subscriptions.invalidAmount'));
        return;
      }
      if (amount > renewNetValue) {
        toast.error(ct('subscriptions.amountExceedsRemaining'));
        return;
      }
      if (amount > 0) {
        const split = buildClubPaymentSplit(renewRows, amount, ct);
        if ('error' in split) {
          toast.error(split.error);
          return;
        }
        body.paidAmount = amount;
        Object.assign(body, split.payload);
      }
    }
    setSaving(true);
    try {
      await api.patch(`/club-subscriptions/${selectedId}/renew`, body);
      toast.success(ct('common.success'));
      setRenewOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openFreeze = (id: number) => {
    setSelectedId(id);
    setFreezeForm({ reason: '' });
    setFreezeOpen(true);
  };

  const submitFreeze = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
      });
      toast.success(ct('common.success'));
      setFreezeOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unfreeze = async (id: number) => {
    const ok = await confirm({ title: ct('subscriptions.unfreezeConfirm') });
    if (!ok) return;
    try {
      await api.post(`/club-subscriptions/${id}/unfreeze`, {});
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (id: number) => {
    if (!canDeleteSubscriptions) return;
    const ok = await confirm({ title: ct('subscriptions.deleteConfirm'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-subscriptions/${id}`);
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveTransfer = async () => {
    const subId = Number(transferForm.subscriptionId);
    const typeId = Number(transferForm.toSubscriptionTypeId);
    const toType = availableSubTypes.find((t) => t.id === typeId);
    const fromSub = (data?.data ?? []).find((s) => s.id === subId);
    if (!subId || !typeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (
      fromSub &&
      Boolean(fromSub.isLinkedToSessions) !== Boolean(toType?.isLinkedToSessions)
    ) {
      toast.error(ct('subscriptions.transferKindMismatch'));
      return;
    }
    if (!transferForm.toEndDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: subId,
        toSubscriptionTypeId: typeId,
        toStartDate: transferForm.toStartDate,
        toEndDate: transferForm.toEndDate,
      });
      toast.success(ct('common.success'));
      setTransferOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveReceipt = async () => {
    if (!receiptForm.memberName.trim() || !receiptForm.amount) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    const receiptAmount = Number(receiptForm.amount);
    if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      let memberId: number | undefined;
      if (receiptForm.memberCode.trim()) {
        const q = receiptForm.memberCode.trim();
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
      await api.post('/club-receipts', {
        memberName: receiptForm.memberName,
        amount: receiptAmount,
        memberId,
        subscriptionId: receiptForm.subscriptionId ? Number(receiptForm.subscriptionId) : undefined,
      });
      toast.success(ct('common.success'));
      setReceiptOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const subColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { id: 'index', header: ct('common.index'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
      { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
      { accessorKey: 'customerName', header: ct('subscriptions.customerName'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionValue', header: ct('subscriptions.value'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
      { accessorKey: 'remainingAmount', header: ct('subscriptions.remaining'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        cell: ({ row }) => {
          const status = row.original.status as string;
          if (status === 'frozen') {
            return <StatusBadge status="info" label={ct('subscriptions.frozen')} />;
          }
          const map: Record<string, 'active' | 'expired' | 'pending'> = {
            active: 'active',
            expired: 'expired',
            upcoming: 'pending',
          };
          return <StatusBadge status={map[status] ?? 'pending'} />;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => !canUpdateSubscriptions && !canDeleteSubscriptions && !canPrintSubscriptions ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdateSubscriptions ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => void openEdit(row.original))}>
                  <Pencil className="size-4" /> {ct('subscriptions.editSub')}
                </DropdownMenuItem>
              ) : null}
              {canPrintSubscriptions ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => setPrintSub(row.original))}>
                  <Printer className="size-4" /> {ct('subscriptions.printInvoice')}
                </DropdownMenuItem>
              ) : null}
              {canUpdateSubscriptions && row.original.remainingAmount > 0 && (
                <>
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openPayment(row.original))}>
                    <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openWaiver(row.original))}>
                    <ShieldOff className="size-4" /> إعفاء
                  </DropdownMenuItem>
                </>
              )}
              {canUpdateSubscriptions ? <DropdownMenuItem onSelect={() => afterMenuClose(() => openRenew(row.original))}><RefreshCw className="size-4" /> {ct('subscriptions.renew')}</DropdownMenuItem> : null}
              {canUpdateSubscriptions && ((row.original.status as string) === 'frozen' ? (
                <DropdownMenuItem onSelect={() => void unfreeze(row.original.id)}><Sun className="size-4" /> {ct('subscriptions.unfreeze')}</DropdownMenuItem>
              ) : (
                (row.original.status as string) === 'active' && (
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}><Snowflake className="size-4" /> {ct('subscriptions.freeze')}</DropdownMenuItem>
                )
              ))}
              {canDeleteSubscriptions ? <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>{ct('common.delete')}</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [
      ct,
      params.page,
      params.pageSize,
      canUpdateSubscriptions,
      canDeleteSubscriptions,
      canPrintSubscriptions,
    ],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={ui(pageTitle)} description={ct('subscriptions.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui(pageTitle)}
        description={ct('subscriptions.description')}
        actions={showNewSubButton && canCreateSubscriptions ? (
          <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('subscriptions.newSub')}</Button>
        ) : undefined}
      />

      {subscriptionOnboarding.visible && !dialogOpen && showNewSubButton && canCreateSubscriptions && (
        <MemberOnboardingGuide
          scope="subscriptions"
          onDismiss={subscriptionOnboarding.dismiss}
          onStart={() => {
            subscriptionOnboarding.dismiss();
            openCreate();
          }}
        />
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClubStatCard label={ct('subscriptions.totalSubs')} value={stats.total} />
          <ClubStatCard label={ct('common.active')} value={stats.active} />
          <ClubStatCard label={ct('subscriptions.totalPaid')} value={stats.totalPaid} />
          <ClubStatCard label={ct('subscriptions.totalRemaining')} value={stats.totalRemaining} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubSubscriptionsView)}>
        {!singleView && !reportFocus && (
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="subs"><CreditCard className="size-4" /> {ct('subscriptions.tabSubs')}</TabsTrigger>
          <TabsTrigger value="receipts"><FileText className="size-4" /> {ct('subscriptions.tabReceipts')}</TabsTrigger>
          <TabsTrigger value="refunds"><Undo2 className="size-4" /> {ct('subscriptions.tabRefunds')}</TabsTrigger>
          <TabsTrigger value="transfers"><Repeat className="size-4" /> {ct('subscriptions.tabTransfers')}</TabsTrigger>
          <TabsTrigger value="waivers"><ShieldOff className="size-4" /> إجمالي الإعفاءات</TabsTrigger>
          <TabsTrigger value="reports">{ct('subscriptions.tabReports')}</TabsTrigger>
        </TabsList>
        )}

        <TabsContent value="subs" className="space-y-4 pt-4">
          <FilterBar
            fields={filters}
            preserveParams={filterSpecial ? ['isSpecial'] : filterTimeBased ? ['isTimeBased'] : []}
          />
          <DataTable
            columns={subColumns}
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
            emptyTitle={ct('subscriptions.emptySubs')}
          />
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4 pt-4">
          <Button variant="outline" onClick={() => { setReceiptForm({ memberName: '', amount: '', memberCode: '', subscriptionId: '' }); setReceiptOpen(true); }}>
            <Plus className="size-4" /> {ct('subscriptions.newReceipt')}
          </Button>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.receiptNumber')}</th>
                  <th className="p-3 text-start">{ct('common.customer')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptAmount')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.paymentMethod')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptDate')}</th>
                </tr>
              </thead>
              <tbody>
                {(receipts ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(receipts ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 nums">{r.receiptNumber}</td>
                    <td className="p-3">{r.memberName}</td>
                    <td className="p-3 nums">{toArabicDigits(r.amount)}</td>
                    <td className="p-3">{clubPaymentMethodsLabel(ct, r.payments, r.paymentMethod)}</td>
                    <td className="p-3 nums">{toArabicDigits(r.receiptDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-4 pt-4">
          <SubscriptionRefundsWorkspace />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4 pt-4">
          <Button variant="outline" onClick={() => setTransferOpen(true)}><Plus className="size-4" /> {ct('subscriptions.newTransfer')}</Button>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.subscriptionId')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferFrom')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferTo')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferDate')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.value')}</th>
                </tr>
              </thead>
              <tbody>
                {(transfers ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(transfers ?? []).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 nums">{toArabicDigits(t.subscription_id)}</td>
                    <td className="p-3">{t.from_subscription_type ?? '—'}</td>
                    <td className="p-3">{t.to_subscription_type}</td>
                    <td className="p-3 nums">{toArabicDigits(t.transfer_date)}</td>
                    <td className="p-3 nums">{toArabicDigits(Number(t.to_value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="waivers" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ClubStatCard label="عدد الإعفاءات" value={waivers?.summary.count ?? 0} />
            <ClubStatCard label="إجمالي الإعفاءات" value={formatMoney(waivers?.summary.totalAmount ?? 0)} />
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">رقم الاشتراك</th><th className="p-3 text-start">العميل</th><th className="p-3 text-start">المبلغ المعفى</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">السبب</th></tr></thead><tbody>{(waivers?.data ?? []).map((row) => <tr key={row.id} className="border-t"><td className="p-3 nums">{row.subscriptionNumber}</td><td className="p-3">{row.memberName ?? '—'}</td><td className="p-3 nums font-medium">{formatMoney(row.amount)}</td><td className="p-3 nums">{toArabicDigits(row.waiverDate)}</td><td className="p-3 text-muted-foreground">{row.reason ?? '—'}</td></tr>)}</tbody></table>
            {!waivers?.data.length ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد إعفاءات مسجلة.</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 pt-4">
          {reportFocus === 'expiring' && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.expiringReport')}</h3>
            <p className="mb-2 text-sm text-muted-foreground nums">
              {toArabicDigits(expiring?.total ?? (expiring?.data?.length ?? 0))} {ct('subscriptions.tabSubs')}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.endDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expiring?.data ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                  )}
                  {(expiring?.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName ?? '—'}</td>
                      <td className="p-2">{s.subscriptionType ?? '—'}</td>
                      <td className="p-2 nums">
                        {toArabicDigits(s.subscriptionEndDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {(!reportFocus || reportFocus === 'outstanding') && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.outstandingReport')}</h3>
            <p className="mb-2 text-sm text-muted-foreground nums">
              {toArabicDigits(outstanding?.summary?.count ?? 0)} {ct('subscriptions.tabSubs')}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.remaining')}</th>
                    <th className="p-2 text-start">{ct('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(outstanding?.subscriptions ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                  )}
                  {(outstanding?.subscriptions ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName ?? '—'}</td>
                      <td className="p-2 nums">{toArabicDigits(s.remainingAmount)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {canUpdateSubscriptions ? <Button size="sm" variant="outline" onClick={() => openPayment(s)}>
                            <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                          </Button> : null}
                          {canUpdateSubscriptions ? <Button size="sm" variant="outline" onClick={() => openWaiver(s)}>
                            <ShieldOff className="size-4" /> إعفاء
                          </Button> : null}
                          {canUpdateSubscriptions ? <Button size="sm" variant="ghost" onClick={() => void openEdit(s)}>
                            <Pencil className="size-4" /> {ct('common.edit')}
                          </Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {(!reportFocus || reportFocus === 'expired') && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.expiredReport')}</h3>
            <p className="mb-2 text-sm nums">{toArabicDigits(expired?.count ?? 0)}</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expired?.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName}</td>
                      <td className="p-2">{s.subscriptionType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
          <FormDialogHeader>
            <DialogTitle>{editSubId ? ct('subscriptions.editSub') : ct('subscriptions.newSub')}</DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
            {subscriptionOnboarding.visible && !editSubId && (
              <MemberOnboardingGuide
                scope="subscriptions"
                compact
                onDismiss={subscriptionOnboarding.dismiss}
              />
            )}
            <section className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
              <div className="mb-3">
                <p className="font-semibold">نوع الاشتراك</p>
                <p className="mt-1 text-sm text-muted-foreground">اختر المسار أولًا لإظهار الباقات أو الحصص المطلوبة.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  { value: 'package', label: 'اشتراك', description: 'الباقات العادية', icon: Package },
                  { value: 'sessions', label: 'حصص', description: 'باقات الحصص في الباقات والأسعار', icon: Dumbbell },
                  { value: 'special', label: 'اشتراكات خاصة', description: 'عدد حصص ومدة مرتبطة بجدول المدربين', icon: Sparkles },
                ] as const).map((item) => {
                  const Icon = item.icon;
                  const selected = subscriptionKind === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={!!editSubId}
                      onClick={() => selectSubscriptionKind(item.value)}
                      className={cn(
                        'flex min-h-24 items-center gap-3 rounded-xl border bg-background p-3 text-start transition-all',
                        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40 hover:bg-muted/30',
                        editSubId && !selected && 'opacity-45',
                      )}
                    >
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="size-5" /></span>
                      <span className="min-w-0"><b className="block text-sm">{item.label}</b><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <DialogFormSection title={ct('subscriptions.sectionCustomer')} icon={User}>
              <DialogFormGrid>
                <FieldWrapper label={ct('common.branch')} required>
                  <Input className="bg-muted" value={formBranchName} readOnly />
                </FieldWrapper>
                <FieldWrapper label={ct('members.registeredBy')}>
                  <Input className="bg-muted" value={user?.name ?? '—'} readOnly />
                </FieldWrapper>
              </DialogFormGrid>
              {subscriptionKind !== 'special' ? <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded accent-primary"
                    checked={walkIn}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWalkIn(checked);
                      if (checked) {
                        setForm((f) => ({ ...f, memberId: '', customerName: f.customerName }));
                        setSelectedMember(null);
                      }
                    }}
                  />
                  {ct('subscriptions.walkInCustomer')}
                </label>
              </div> : null}
              {walkIn ? (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <Input
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder={ct('subscriptions.customerName')}
                  />
                </FieldWrapper>
              ) : (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <MemberSearchCombobox
                    selectedMember={selectedMember}
                    onSelect={(member) => {
                      setSelectedMember(member);
                      setForm((f) => ({
                        ...f,
                        memberId: String(member.id),
                        customerName: member.name,
                        gender: member.gender ?? f.gender,
                      }));
                    }}
                    onClear={() => {
                      setSelectedMember(null);
                      setForm((f) => ({ ...f, memberId: '', customerName: '' }));
                    }}
                  />
                </FieldWrapper>
              )}
              {selectedMember && !walkIn && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedMember.name}</span>
                  <span className="nums text-muted-foreground font-mono ms-2">{selectedMember.memberCode}</span>
                  {selectedMember.phone && (
                    <span className="nums text-muted-foreground"> · {toArabicDigits(selectedMember.phone)}</span>
                  )}
                </div>
              )}
            </DialogFormSection>

            {subscriptionKind === 'special' ? (
              <DialogFormSection title="الاشتراك الخاص" icon={CalendarDays}>
                <DialogFormGrid>
                  <FieldWrapper label="نوع الاشتراك الخاص" required>
                    <select
                      className={selectCls}
                      value={form.specialClassTypeId}
                      onChange={(event) => {
                        const specialClassTypeId = event.target.value;
                        const selectedClass = specialClassTypes?.find(
                          (item) => item.id === Number(specialClassTypeId),
                        );
                        setForm((current) => ({
                          ...current,
                          specialClassTypeId,
                          sessionsCount: selectedClass ? '1' : '',
                          validityDays: selectedClass ? '30' : '',
                          endDate: selectedClass ? addDaysLocal(current.startDate, 30) : '',
                          subscriptionValue: selectedClass
                            ? String(selectedClass.singleSessionPrice)
                            : '',
                        }));
                      }}
                    >
                      <option value="">اختر الاشتراك الخاص</option>
                      {(specialClassTypes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </FieldWrapper>
                  <FieldWrapper label={ct('subscriptions.startDate')} required>
                    <Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </FieldWrapper>
                  {(() => {
                    const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                    if (!item) return null;
                    return <>
                      <FieldWrapper label="عدد الحصص" required>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          className="nums"
                          value={form.sessionsCount}
                          onChange={(event) => {
                            const sessionsCount = event.target.value;
                            const parsedCount = Number(sessionsCount);
                            setForm((current) => ({
                              ...current,
                              sessionsCount,
                              subscriptionValue:
                                Number.isInteger(parsedCount) && parsedCount > 0
                                  ? String(item.singleSessionPrice * parsedCount)
                                  : '',
                            }));
                          }}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="مدة صلاحية الاشتراك (يوم)" required>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          step={1}
                          className="nums"
                          value={form.validityDays}
                          onChange={(event) => {
                            const validityDays = event.target.value;
                            const parsedDays = Number(validityDays);
                            setForm((current) => ({
                              ...current,
                              validityDays,
                              endDate:
                                Number.isInteger(parsedDays) && parsedDays > 0
                                  ? addDaysLocal(current.startDate, parsedDays)
                                  : '',
                            }));
                          }}
                        />
                      </FieldWrapper>
                      <FieldWrapper label={ct('subscriptions.endDate')}><Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly /></FieldWrapper>
                      <FieldWrapper label="سعر الحصة"><Input className="nums bg-muted" value={toArabicDigits(item.singleSessionPrice)} readOnly /></FieldWrapper>
                    </>;
                  })()}
                </DialogFormGrid>
                {(() => {
                  const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                  if (!item) return null;
                  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                  return (
                    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="font-semibold">جدول المدربين المتاح للكلاس</p>
                      <p className="mt-1 text-xs text-muted-foreground">لا يلزم حجز موعد. عند حضور العضو، يطابق الاستقبال الموعد الحالي تلقائيًا ويسجل الحضور مع المدرب.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(item.trainerScheduleSlots ?? []).map((slot, index) => {
                          const trainer = item.eligibleTrainers.find((candidate) => candidate.id === slot.trainerId);
                          return <div key={slot.id ?? `${slot.trainerId}-${index}`} className="rounded-lg border bg-background px-3 py-2 text-sm"><b>{trainer?.name ?? 'مدرب'}</b><span className="text-muted-foreground"> · {days[slot.weekday]} · <span className="nums">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span></span></div>;
                        })}
                      </div>
                    </div>
                  );
                })()}
              </DialogFormSection>
            ) : (
            <DialogFormSection title={ct('subscriptions.sectionSubscription')} icon={CalendarDays}>
              <DialogFormGrid>
                <FieldWrapper label={ct('subscriptions.subType')} required>
                  <SubscriptionTypeSelect
                    types={subTypes as ClubSubscriptionType[]}
                    mode="all"
                    value={form.subscriptionTypeId}
                    onChange={(typeId) =>
                      setForm((f) => ({ ...f, subscriptionTypeId: typeId }))
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.startDate')} required>
                  <Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                </FieldWrapper>
                {(() => {
                  const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
                  if (!selectedType) return null;
                  return (
                    <>
                      {selectedType.isLinkedToSessions ? (
                        <FieldWrapper label={ct('packages.sessionsCount')}>
                          <Input
                            className="nums bg-muted"
                            value={`${toArabicDigits(selectedType.sessionsCount ?? (Number(form.sessionsCount) || 0))} ${ct('packages.sessionsUnit')}`}
                            readOnly
                          />
                        </FieldWrapper>
                      ) : null}
                      <FieldWrapper label={ct('subscriptions.endDate')}>
                        <Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly />
                      </FieldWrapper>
                    </>
                  );
                })()}
              </DialogFormGrid>
            </DialogFormSection>
            )}

            <DialogFormSection title={ct('subscriptions.sectionPayment')} icon={Wallet}>
              <DialogFormGrid>
                {editSubId ? (
                  <FieldWrapper label={ct('subscriptions.paymentMethod')} className="sm:col-span-2">
                    <ClubPaymentMethodSelect
                      value={paymentRows[0]?.method ?? 'cash'}
                      onChange={(method) => setPaymentRows(singlePaymentRow(method))}
                    />
                  </FieldWrapper>
                ) : (
                  <div className="sm:col-span-2">
                    <ClubPaymentSplitFields
                      total={formNetValue}
                      rows={paymentRows}
                      onChange={setPaymentRows}
                      onTotalChange={(paidAmount) =>
                        setForm((current) => ({ ...current, paidAmount: String(paidAmount) }))
                      }
                    />
                  </div>
                )}
                <FieldWrapper label={ct('subscriptions.receiptNumber')}>
                  <Input className="nums bg-muted" dir="ltr" value={ct('subscriptions.autoGenerated')} readOnly />
                </FieldWrapper>
              </DialogFormGrid>
              {editSubId ? (
                <SubscriptionPaymentPanel
                  value={formNetValue}
                  paid={Number(form.paidAmount) || 0}
                  remaining={editRemainingAmount ?? 0}
                  receipts={subscriptionReceipts}
                  loading={loadingSubscriptionReceipts}
                />
              ) : (
                <DialogFormSummary
                  items={[
                    { label: ct('subscriptions.value'), value: toArabicDigits(form.subscriptionValue || 0) },
                    {
                      label: ct('subscriptions.paid'),
                      value: toArabicDigits(form.paidAmount || 0),
                      accent: 'success',
                    },
                    {
                      label: ct('subscriptions.remaining'),
                      value: toArabicDigits(formRemaining),
                      accent: 'warning',
                    },
                  ]}
                />
              )}
            </DialogFormSection>
          </FormDialogBody>

          <FormDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            {(editSubId ? canUpdateSubscriptions : canCreateSubscriptions) ? (
              <Button variant="brand" onClick={() => void saveSub()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
            ) : null}
          </FormDialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) setPaymentSub(null);
        }}
      >
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.paymentTitle')}</DialogTitle></DialogHeader>
          {paymentSub && (
            <SubscriptionPaymentPanel
              value={subscriptionNetValue(paymentSub)}
              paid={paymentSub.paidAmount}
              remaining={paymentMaxRemaining}
              receipts={subscriptionReceipts}
              loading={loadingSubscriptionReceipts}
            />
          )}
          <ClubPaymentSplitFields
            total={paymentMaxRemaining}
            rows={installmentRows}
            onChange={setInstallmentRows}
            onTotalChange={(amount) => setPaymentAmount(String(amount))}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void pay()} disabled={saving}>{ct('subscriptions.pay')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waiverOpen} onOpenChange={(open) => { setWaiverOpen(open); if (!open) setWaiverSub(null); }}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>إعفاء من المديونية</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">هذا الإجراء لا يُعتبر سدادًا.</p>
              <p className="mt-1 text-muted-foreground">سيتم تخفيض المديونية فقط، بدون إيصال أو إيراد أو حركة خزينة أو قيد محاسبي.</p>
            </div>
            {waiverSub ? <DialogFormSummary items={[{ label: 'العميل', value: waiverSub.customerName ?? '—' }, { label: 'المديونية الحالية', value: formatMoney(waiverSub.remainingAmount), accent: 'warning' }]} /> : null}
            <FieldWrapper label="المبلغ المعفى" required><Input type="number" min={0.01} max={waiverSub?.remainingAmount} step="0.01" className="nums text-lg" value={waiverForm.amount} onChange={(event) => setWaiverForm((current) => ({ ...current, amount: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label="سبب الإعفاء"><Input value={waiverForm.reason} onChange={(event) => setWaiverForm((current) => ({ ...current, reason: event.target.value }))} placeholder="اختياري" /></FieldWrapper>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setWaiverOpen(false)}>إلغاء</Button><Button variant="brand" onClick={() => void waive()} disabled={saving}><ShieldOff className="size-4" /> تأكيد الإعفاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newTransfer')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={transferForm.subscriptionId} onChange={(e) => setTransferForm((f) => ({ ...f, subscriptionId: e.target.value, toSubscriptionTypeId: '' }))} />
            <div className="grid gap-2">
              <Label>{ct('subscriptions.transferToType')}</Label>
              {(() => {
                const fromSub = (data?.data ?? []).find(
                  (s) => s.id === Number(transferForm.subscriptionId),
                );
                if (!transferForm.subscriptionId || !fromSub) {
                  return (
                    <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      {ct('subscriptions.subscriptionId')}
                    </p>
                  );
                }
                return (
                  <TransferPlanPicker
                    types={availableSubTypes as ClubSubscriptionType[]}
                    sourceIsSessions={Boolean(fromSub.isLinkedToSessions)}
                    excludeTypeId={fromSub.subscriptionTypeId}
                    value={transferForm.toSubscriptionTypeId}
                    onChange={(typeId) =>
                      setTransferForm((f) => ({ ...f, toSubscriptionTypeId: typeId }))
                    }
                  />
                );
              })()}
            </div>
            <Input type="date" value={transferForm.toStartDate} onChange={(e) => setTransferForm((f) => ({ ...f, toStartDate: e.target.value }))} />
            <Input type="date" className="bg-muted" value={transferForm.toEndDate} readOnly />
            <Input className="nums bg-muted" value={transferForm.toValue} readOnly placeholder={ct('subscriptions.transferToValue')} />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newReceipt')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={ct('subscriptions.customerName')} value={receiptForm.memberName} onChange={(e) => setReceiptForm((f) => ({ ...f, memberName: e.target.value }))} />
            <Input className="nums" type="number" min={0} step="any" placeholder={ct('common.amount')} value={receiptForm.amount} onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input className="font-mono" dir="ltr" placeholder={ct('subscriptions.memberIdOptional')} value={receiptForm.memberCode} onChange={(e) => setReceiptForm((f) => ({ ...f, memberCode: e.target.value }))} />
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={receiptForm.subscriptionId} onChange={(e) => setReceiptForm((f) => ({ ...f, subscriptionId: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void saveReceipt()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <div className="grid gap-2">
              <Label>{ct('subscriptions.freezeReason')}</Label>
              <Input
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {renewSub && (
              <DialogFormSummary
                items={[
                  {
                    label: ct('subscriptions.value'),
                    value: formatMoney(renewNetValue),
                  },
                  {
                    label: ct('subscriptions.paid'),
                    value: formatMoney(renewPaidNow),
                    accent: 'success',
                  },
                  {
                    label: ct('subscriptions.remaining'),
                    value: formatMoney(renewRemaining),
                    accent: 'warning',
                  },
                ]}
              />
            )}
            <ClubPaymentSplitFields
              total={renewNetValue}
              rows={renewRows}
              onChange={setRenewRows}
              onTotalChange={(paidAmount) =>
                setRenewForm({ paidAmount: String(paidAmount) })
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitRenew()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.renew')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionInvoicePrint
        open={!!printSub}
        onOpenChange={(open) => !open && setPrintSub(null)}
        subscription={printSub}
        receipts={printSub ? subscriptionReceipts : []}
      />
    </div>
  );
}
