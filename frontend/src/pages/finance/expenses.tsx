import { formatMoneyNumber, formatDateTime } from '@/lib/formatters';
import { ClubPaymentSplitFields, singlePaymentRow, splitRowsTotal, type ClubPaymentSplitRow } from '@/components/club/club-payment-split-fields';
import { clubPaymentMethodsLabel, type ClubPaymentMethod } from '@/components/club/club-payment-method-select';
import { useClubT } from '@/hooks/use-club-t';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { LockKeyhole, Printer, Check, FileText, Pencil, Plus, Tag, Trash2, WalletCards, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { useMyPermissions, usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { buildExpenseVoucherHtml, printHtmlDocument } from '@/lib/expense-voucher-print';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import {
  EXPENSE_CATEGORY_VALUES,
  financeOptions,
  type ExpenseCategory,
  type ExpenseRow,
} from '@/types/finance';
import { useLocale } from '@/store/locale';
import { indexColumn } from '../inventory/simple-crud-tab';
import { FinancePageShell } from './finance-shell';
import { buildExpensePayload } from './expense-form';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { uiStatic } from '@/lib/ui-static';

const EMPTY_FORM = {
  expenseDate: '',
  category: '',
  subCategory: '',
  amount: '',
  // Canonical stored values (Arabic) — locale-independent, matches backend literals.
  paymentMethod: uiStatic('نقدي'),
  paymentStatus: uiStatic('معلق'),
  description: '',
  vendor: '',
  invoiceNumber: '',
  receiptNumber: '',
  taxAmount: '',
  notes: '',
  branchId: '',
  deductFromDrawer: false,
  businessUnit: 'gym' as 'gym' | 'cafe',
  paidAmount: '',
};

function dateTimeInput(value = new Date().toISOString()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date).replace(' ', 'T');
}

function paymentRows(expense: ExpenseRow): ClubPaymentSplitRow[] {
  if (expense.payments?.length) return expense.payments.map((row) => ({ method: row.method as ClubPaymentMethod, amount: String(row.amount) }));
  const methods: Record<string, ClubPaymentMethod> = { 'نقدي': 'cash', 'بطاقة': 'card', 'فيزا': 'visa', 'تحويل بنكي': 'transfer', 'حساب بنكي': 'bank', 'محفظة': 'wallet', 'إنستا باي': 'instapay' };
  return singlePaymentRow(methods[expense.paymentMethod] ?? 'cash', expense.paidAmount ?? (expense.paymentStatus === 'مدفوع' ? expense.totalAmount : 0));
}

export function FinanceExpensesPage() {
  const { ui, dir, locale } = useLocale();
  const ct = useClubT();
  const { can } = usePermission();
  const canCreate = can('financial-reports.expenses:create');
  const { policy } = useClubPrintingPolicy();
  const canUpdate = can('financial-reports.expenses:update');
  const canDelete = can('financial-reports.expenses:delete');
  const canApprove = can('financial-reports.expenses:approve');
  const canReject = can('financial-reports.expenses:reject');
  const { user } = useAuth();
  const { data: permissions } = useMyPermissions();
  const expenseScope = permissions?.scope['financial-reports.expenses'];
  const ownExpensesOnly = !!permissions && !permissions.superAdmin && expenseScope !== 'global' && expenseScope !== 'branch';
  const canFilterUsers = !!permissions && !ownExpensesOnly;
  const { params, setParams } = useListQuery();
  const businessUnit = params.filters.businessUnit === 'cafe' ? 'cafe' : 'gym';
  const listParams = { ...params, filters: { ...params.filters, businessUnit } };
  const { data: branches } = useBranches();
  const printExpense = (expense: ExpenseRow) => printThermalFinancialReceiptWithFallback({
    documentNumber: expense.expenseNumber,
    transactionLabel: 'Expense voucher',
    itemName: expense.description || expense.category,
    customerName: expense.vendor,
    branchName: branches?.find((branch) => branch.id === expense.branchId)?.name,
    collectedAmount: expense.paidAmount ?? (expense.paymentStatus === 'مدفوع' ? expense.totalAmount : 0),
    payments: expense.payments ?? undefined,
    paymentMethod: expense.paymentMethod,
    issuedAt: expense.expenseDate,
    operatorName: user?.name,
  }, policy);
  const { data, isLoading, isError, refetch } = usePaginatedList<ExpenseRow>('expenses', listParams);
  const expenseUsers = useQuery({
    queryKey: ['expenses', 'users', user?.sub],
    queryFn: async ({ signal }) => (await api.get<{ id: number; name: string | null }[]>('/expenses/users', {
      signal,
    })).data,
    enabled: canFilterUsers,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [payRows, setPayRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const expenseTotal = Math.round(((Number(form.amount) || 0) + (Number(form.taxAmount) || 0)) * 100) / 100;
  const paidTotal = splitRowsTotal(payRows);
  const remainingTotal = Math.round((expenseTotal - paidTotal) * 100) / 100;
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  // Flexible expense types (أنواع المصروفات) come from the DB; fall back to the built-in list.
  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data } = await api.get<ExpenseCategory[]>('/expense-categories');
      return data;
    },
  });
  const activeCategoryNames = (categories ?? []).filter((c) => c.isActive).map((c) => c.name);
  const categoryOptions = financeOptions(
    activeCategoryNames.length ? activeCategoryNames : [...EXPENSE_CATEGORY_VALUES],
  );

  const addCategory = async () => {
    if (!canCreate) return;
    const name = newCat.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      await api.post('/expense-categories', { name });
      setNewCat('');
      toast.success(ui('تمت إضافة النوع'));
      void refetchCategories();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCatBusy(false);
    }
  };

  const toggleCategory = async (c: ExpenseCategory) => {
    if (!canUpdate) return;
    try {
      await api.put(`/expense-categories/${c.id}`, { isActive: !c.isActive });
      void refetchCategories();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deleteCategory = async (c: ExpenseCategory) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف النوع'),
      description: `${ui('حذف «')}${c.name}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/expense-categories/${c.id}`);
      toast.success(ui('تم حذف النوع'));
      void refetchCategories();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filters: FilterField[] = [
    {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
    ...(canFilterUsers ? [{
      key: 'userId',
      label: ui('المستخدم'),
      type: 'select' as const,
      allLabel: ui('كل المستخدمين'),
      placeholder: ui(expenseUsers.isPending ? 'جارٍ تحميل المستخدمين…' : 'كل المستخدمين'),
      disabled: expenseUsers.isPending || expenseUsers.isError,
      options: (expenseUsers.data ?? []).map((account) => ({ value: String(account.id), label: account.name ?? `#${account.id}` })),
    }] : []),
    {
      key: 'category',
      label: ui('الفئة'),
      type: 'select',
      options: categoryOptions,
    },
    {
      key: 'approvalStatus',
      label: ui('الموافقة'),
      type: 'select',
      options: [
        { value: 'معلق', label: ui('معلق') },
        { value: 'موافق عليه', label: ui('معتمد') },
        { value: 'مرفوض', label: ui('مرفوض') },
      ],
    },
  ];

  const columns = useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<ExpenseRow>,
      {
        accessorKey: 'expenseDate',
        header: ui('التاريخ'),
        cell: ({ row }) => <span className="nums whitespace-nowrap">{formatDateTime(row.original.expenseDate.length > 10 ? row.original.expenseDate : `${row.original.expenseDate}T${dateTimeInput(row.original.createdAt).slice(11)}:00`, locale)}</span>,
      },
      { accessorKey: 'category', header: ui('الفئة') },
      { accessorKey: 'vendor', header: ui('المورد'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'createdByName',
        header: ui('من قام بالصرف'),
        cell: ({ row }) => row.original.createdByName ?? '—',
      },
      {
        accessorKey: 'amount',
        header: ui('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{formatMoneyNumber((getValue() as number))}</span>,
      },
      { accessorKey: 'paymentMethod', header: ui('طريقة الدفع'), cell: ({ row }) => clubPaymentMethodsLabel(ct, row.original.payments, row.original.paymentMethod) },
      { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ row }) => row.original.paymentNeedsReview ? ui('راجع المدفوع') : formatMoneyNumber(row.original.paidAmount ?? 0) },
      { accessorKey: 'remainingAmount', header: ui('المتبقي'), cell: ({ row }) => row.original.paymentNeedsReview ? '—' : formatMoneyNumber(row.original.remainingAmount ?? 0) },
      { accessorKey: 'paymentStatus', header: ui('حالة الدفع') },
      { accessorKey: 'approvalStatus', header: ui('الموافقة') },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              permissionAction={null}
              title={ui('سند صرف')}
              aria-label={ui('سند صرف')}
              onClick={() => printHtmlDocument(buildExpenseVoucherHtml(row.original, {
                brandName: 'ONE80',
                branchName: (branches ?? []).find((b) => b.id === row.original.branchId)?.name ?? null,
                printedBy: user?.name ?? null,
                ui,
                dir,
              }))}
            >
              <FileText className="size-4" />
            </Button>
            {row.original.approvalStatus === 'موافق عليه' && row.original.paymentStatus === 'مدفوع' ? (
              <Button variant="ghost" size="icon" permissionAction={null} aria-label={ui('طباعة سند الصرف')} title={ui('طباعة سند الصرف')} onClick={() => printExpense(row.original)}>
                <Printer className="size-4" />
              </Button>
            ) : null}
            {row.original.approvalStatus === 'معلق' && (canApprove || canReject) && (
              <>
                {canApprove && <Button
                  variant="ghost"
                  size="icon"
                  title={ui('اعتماد')}
                  disabled={actingId === row.original.id}
                  onClick={async () => {
                    if (actingId != null) return;
                    setActingId(row.original.id);
                    try {
                      await api.patch(`/expenses/${row.original.id}/approve`);
                      toast.success(ui('تم اعتماد المصروف'));
                      void refetch();
                    } catch (e) {
                      toast.error(apiError(e));
                    } finally {
                      setActingId(null);
                    }
                  }}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>}
                {canReject && <Button
                  variant="ghost"
                  size="icon"
                  title={ui('رفض')}
                  disabled={actingId === row.original.id}
                  onClick={() => {
                    setRejectId(row.original.id);
                    setRejectNotes('');
                    setRejectOpen(true);
                  }}
                >
                  <X className="h-4 w-4 text-red-600" />
                </Button>}
              </>
            )}
            {canUpdate && !row.original.systemManaged && <Button
              variant="ghost"
              size="icon"
              permissionResource="financial-reports.expenses"
              permissionAction="update"
              aria-label={ui('تعديل مصروف')}
              onClick={() => {
                setEditId(row.original.id);
                setPayRows(paymentRows(row.original));
                setForm({
                  expenseDate: row.original.expenseDate.length > 10 ? row.original.expenseDate.slice(0, 16) : `${row.original.expenseDate}T${dateTimeInput(row.original.createdAt).slice(11)}`,
                  businessUnit: row.original.businessUnit ?? businessUnit,
                  paidAmount: String(row.original.paidAmount ?? 0),
                  category: row.original.category,
                  subCategory: row.original.subCategory ?? '',
                  amount: String(row.original.amount),
                  paymentMethod: row.original.paymentMethod,
                  paymentStatus: row.original.paymentStatus,
                  description: row.original.description ?? '',
                  vendor: row.original.vendor ?? '',
                  invoiceNumber: row.original.invoiceNumber ?? '',
                  receiptNumber: row.original.receiptNumber ?? '',
                  taxAmount: row.original.taxAmount != null ? String(row.original.taxAmount) : '',
                  notes: row.original.notes ?? '',
                  branchId: row.original.branchId != null ? String(row.original.branchId) : '',
                  deductFromDrawer: false,
                });
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>}
            {canDelete && !row.original.systemManaged && <Button
              variant="ghost"
              size="icon"
              permissionResource="financial-reports.expenses"
              permissionAction="delete"
              aria-label={ui('حذف')}
              onClick={async () => {
                if (!(await confirm({ title: ui('حذف هذا المصروف؟') }))) return;
                try {
                  await api.delete(`/expenses/${row.original.id}`);
                  toast.success(ui('تم الحذف'));
                  void refetch();
                } catch (e) {
                  toast.error(apiError(e));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>}
          </div>
        ),
      },
    ],
    [params.page, params.pageSize, refetch, ui, ct, locale, businessUnit, dir, branches, user?.name, actingId, canApprove, canReject, canUpdate, canDelete],
  );

  const submitReject = async () => {
    if (!canReject) return;
    if (rejectId == null) return;
    if (!rejectNotes.trim()) {
      toast.error(ui('يرجى إدخال سبب الرفض'));
      return;
    }
    setActingId(rejectId);
    try {
      await api.patch(`/expenses/${rejectId}/reject`, { notes: rejectNotes.trim() });
      toast.success(ui('تم رفض المصروف'));
      setRejectOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActingId(null);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, businessUnit, expenseDate: dateTimeInput(), branchId: String(user?.branch ?? branches?.[0]?.id ?? '') });
    setPayRows(singlePaymentRow());
    setOpen(true);
  };

  const save = async () => {
    if (editId != null ? !canUpdate : !canCreate) return;
    if (!form.category || !form.amount) {
      toast.error(ui('يرجى تعبئة الفئة والمبلغ'));
      return;
    }
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error(ui('المبلغ يجب أن يكون رقماً موجباً'));
      return;
    }
    if (form.taxAmount && Number(form.taxAmount) < 0) {
      toast.error(ui('المبلغ يجب أن يكون رقماً موجباً'));
      return;
    }
    if (paidTotal < 0 || payRows.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) || remainingTotal < 0) {
      toast.error(ui('المدفوع يجب ألا يتجاوز إجمالي المصروف'));
      return;
    }
    const payload = buildExpensePayload({
      ...form,
      paidAmount: String(paidTotal),
      payments: payRows.filter((row) => Number(row.amount) > 0).map((row) => ({ method: row.method, amount: Number(row.amount) })),
      paymentMethod: payRows[0]?.method === 'cash' ? 'نقدي' : payRows[0]?.method ?? 'cash',
      paymentStatus: paidTotal === 0 ? 'معلق' : remainingTotal > 0 ? 'جزئي' : 'مدفوع',
    }, editId == null);
    setSaving(true);
    try {
      if (editId != null) {
        await api.put(`/expenses/${editId}`, payload);
        toast.success(ui('تم تحديث المصروف'));
      } else {
        const { data: created } = await api.post<ExpenseRow>('/expenses', payload);
        if (created.approvalStatus === 'موافق عليه' && created.paymentStatus === 'مدفوع') printExpense(created);
        toast.success(ui('تم إنشاء المصروف'));
      }
      setOpen(false);
      void refetch();
      if (canFilterUsers) void expenseUsers.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinancePageShell title={ui('إدارة المصروفات')} description={ui('تسجيل ومتابعة واعتماد المصروفات')}>
      <div className="flex gap-2" role="group" aria-label={ui('مصروفات')}>
        <Button permissionAction={null} variant={businessUnit === 'gym' ? 'default' : 'outline'} onClick={() => setParams({ filters: { businessUnit: 'gym' }, page: 1 })}>{ui('مصروفات الجيم')}</Button>
        <Button permissionAction={null} variant={businessUnit === 'cafe' ? 'default' : 'outline'} onClick={() => setParams({ filters: { businessUnit: 'cafe' }, page: 1 })}>{ui('مصروفات الكافيه')}</Button>
      </div>
      {ownExpensesOnly ? (
        <div className="mb-4 flex min-h-11 max-w-md flex-wrap items-center gap-3 rounded-xl border bg-muted/45 px-4 py-2">
          <LockKeyhole className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 font-semibold">{user?.name ?? ui('المستخدم')}</span>
          <Badge variant="secondary" className="ms-auto shrink-0">{ui('مصروفاتي فقط')}</Badge>
        </div>
      ) : null}
      <div className="mb-4 flex justify-end gap-2">
        {(canCreate || canUpdate || canDelete) && <Button variant="outline" onClick={() => setCatOpen(true)}>
          <Tag className="ms-1 h-4 w-4" />
          {ui('إدارة الأنواع')}
        </Button>}
        {canCreate && <Button onClick={openCreate}>
          <Plus className="ms-1 h-4 w-4" />
          {ui('مصروف جديد')}
        </Button>}
      </div>
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في المصروفات…')} preserveParams={['businessUnit']} />
      {canFilterUsers && expenseUsers.isError && <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-destructive">{ui('تعذر تحميل المستخدمين')}</span>
        <Button permissionAction={null} variant="outline" onClick={() => void expenseUsers.refetch()}>{ui('إعادة المحاولة')}</Button>
      </div>}
      <DataTable
        exportSource={{ resource: 'expenses', params: listParams }}
        rowClassName={(expense) => expense.paymentNeedsReview
          ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50'
          : (expense.paidAmount ?? 0) <= 0
          ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50'
          : (expense.remainingAmount ?? 0) > 0
            ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50'
            : undefined}
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
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل مصروف') : ui('مصروف جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="expense-date">{ui('التاريخ والوقت')}</Label>
                <Input
                  id="expense-date"
                  className="nums"
                  type="datetime-local"
                  value={form.expenseDate}
                  onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="expense-branch">{ui('الفرع')}</Label>
                <select
                  id="expense-branch"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  <option value="">{ui('—')}</option>
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="expense-category">{ui('الفئة')}</Label>
                <select
                  id="expense-category"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  <option value="">{ui('اختر الفئة')}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="expense-subcategory">{ui('الفئة الفرعية')}</Label>
                <Input id="expense-subcategory" value={form.subCategory} onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="expense-amount">{ui('قيمة المصروف قبل الضريبة')}</Label>
                <Input id="expense-amount" className="nums" type="number" min={0} step="0.01"
                  value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="expense-tax">{ui('الضريبة')}</Label>
                <Input id="expense-tax" className="nums" type="number" min={0} step="0.01"
                  value={form.taxAmount} onChange={(event) => setForm((current) => ({ ...current, taxAmount: event.target.value }))} />
              </div>
            </div>
            <section className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">{ui('الدفع')}</h3>
              <ClubPaymentSplitFields total={expenseTotal} rows={payRows} disabled={saving}
                onChange={(rows) => {
                  setPayRows(rows);
                  setForm((current) => ({ ...current, deductFromDrawer: rows.length === 1 && rows[0].method === 'cash' ? current.deductFromDrawer : false }));
                }} />
              <div className="flex flex-wrap justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span>{ui('الإجمالي شامل الضريبة')}: <b className="nums">{formatMoneyNumber(expenseTotal)}</b></span>
                <span>{ui('المدفوع')}: <b className="nums">{formatMoneyNumber(paidTotal)}</b></span>
                <span className={paidTotal === 0 ? 'text-red-700 dark:text-red-300' : remainingTotal > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}>
                  {ui('المتبقي')}: <b className="nums">{formatMoneyNumber(remainingTotal)}</b>
                </span>
              </div>
            </section>
            {editId == null ? (
              <div className="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/35 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <WalletCards className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <Label htmlFor="deduct-from-drawer" className="cursor-pointer font-bold">
                      {ui('خصم المبلغ من نقدية الدرج')}
                    </Label>
                    <p id="deduct-from-drawer-help" className="mt-1 text-sm leading-6 text-muted-foreground">
                      {ui('يُخصم المدفوع نقدًا من وردية الفرع المفتوحة.')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="deduct-from-drawer"
                  checked={form.deductFromDrawer}
                  aria-describedby="deduct-from-drawer-help"
                  disabled={saving || payRows.length !== 1 || payRows[0]?.method !== 'cash' || paidTotal <= 0}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, deductFromDrawer: checked }))}
                />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="expense-vendor">{ui('المورد')}</Label>
                <Input id="expense-vendor" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="expense-invoice">{ui('رقم الفاتورة')}</Label>
                <Input
                  id="expense-invoice"
                  className="nums"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="expense-notes">{ui('ملاحظات')}</Label>
              <Textarea id="expense-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            {(editId != null ? canUpdate : canCreate) && <Button permissionAction={editId != null ? 'update' : 'create'} onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('رفض المصروف')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="reject-notes">{ui('سبب الرفض')}</Label>
            <Textarea
              id="reject-notes"
              rows={3}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {ui('إلغاء')}
            </Button>
            {canReject && <Button variant="destructive" disabled={actingId != null} onClick={() => void submitReject()}>
              {ui('رفض')}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui('إدارة أنواع المصروفات')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder={ui('اسم النوع (مثال: كهرباء، مياه)')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addCategory();
                }}
              />
              {canCreate && <Button onClick={() => void addCategory()} disabled={catBusy || !newCat.trim()}>
                <Plus className="h-4 w-4" />
                {ui('إضافة')}
              </Button>}
            </div>
            <div className="divide-y rounded-lg border">
              {(categories ?? []).length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{ui('لا توجد أنواع')}</p>
              ) : (
                (categories ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={c.isActive ? 'font-medium' : 'text-muted-foreground line-through'}>
                        {c.name}
                      </span>
                      {c.isSystem && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {ui('نظام')}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleCategory(c)}
                        title={c.isActive ? ui('إيقاف') : ui('تفعيل')}
                      >
                        {c.isActive ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </Button>
                      {!c.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => void deleteCategory(c)}
                          aria-label={ui('حذف')}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>
              {ui('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinancePageShell>
  );
}
