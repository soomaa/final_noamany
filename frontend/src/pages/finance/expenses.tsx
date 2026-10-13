import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
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
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { localToday } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import {
  EXPENSE_CATEGORY_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  financeOptions,
  type ExpenseCategory,
  type ExpenseFormPayload,
  type ExpenseRow,
} from '@/types/finance';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { usePermission } from '@/hooks/use-permission';
import { indexColumn } from '../inventory/simple-crud-tab';
import { FinancePageShell } from './finance-shell';

const GENDER_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: 'male', label: 'رجالي' },
  { value: 'female', label: 'حريمي' },
] as const;

const EMPTY_FORM = {
  expenseDate: '',
  category: '',
  subCategory: '',
  amount: '',
  // Canonical stored values (Arabic) — locale-independent, matches backend literals.
  paymentMethod: 'نقدي',
  paymentStatus: 'معلق',
  description: '',
  vendor: '',
  invoiceNumber: '',
  receiptNumber: '',
  taxAmount: '',
  notes: '',
  branchId: '',
  genderScope: '' as '' | 'male' | 'female',
  hasPercentage: false,
  malePercentage: '60',
  femalePercentage: '40',
};

export function FinanceExpensesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { superAdmin } = usePermission();
  const title = user?.job_title ?? '';
  const receptionOnly = !superAdmin && user?.level !== 1 && user?.level !== 3 && /(استقبال|ريسيبشن|ريسبشن|reception)/i.test(title) && !/(مدير|مشرف|رئيس|manager|supervisor|head)/i.test(title);
  const expenseParams = receptionOnly ? { ...params, filters: { ...params.filters, branchId: String(user?.branch ?? 0), dateFrom: localToday(), dateTo: localToday() } } : params;
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<ExpenseRow>('expenses', expenseParams);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
  const paymentMethodOptions = financeOptions(PAYMENT_METHOD_VALUES);
  const paymentStatusOptions = financeOptions(PAYMENT_STATUS_VALUES);

  // Derived: percentages must sum to 100 when hasPercentage is on
  const malePct = Number(form.malePercentage) || 0;
  const femalePct = Number(form.femalePercentage) || 0;
  const percentageValid = !form.hasPercentage || (malePct + femalePct === 100 && malePct > 0 && femalePct > 0);

  const addCategory = async () => {
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
    try {
      await api.put(`/expense-categories/${c.id}`, { isActive: !c.isActive });
      void refetchCategories();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deleteCategory = async (c: ExpenseCategory) => {
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
    {
      key: 'genderScope',
      label: ui('النطاق'),
      type: 'select',
      options: GENDER_OPTIONS.filter((o) => o.value !== '').map((o) => ({ value: o.value, label: ui(o.label) })),
    },
  ];

  const genderLabel = (scope: 'male' | 'female' | null | undefined) => {
    if (scope === 'male') return ui('رجالي');
    if (scope === 'female') return ui('حريمي');
    return '—';
  };

  const columns = useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<ExpenseRow>,
      {
        accessorKey: 'expenseDate',
        header: ui('التاريخ'),
        cell: ({ getValue }) => <span className="nums">{getValue() as string}</span>,
      },
      { accessorKey: 'category', header: ui('الفئة') },
      { accessorKey: 'vendor', header: ui('المورد'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'amount',
        header: ui('المبلغ'),
        cell: ({ row }) => {
          const r = row.original;
          const amt = r.nesba != null && r.mainValue != null
            ? `${toArabicDigits(r.amount.toFixed(2))} (${toArabicDigits(String(r.nesba))}%)`
            : toArabicDigits(r.amount.toFixed(2));
          return <span className="nums">{amt}</span>;
        },
      },
      {
        id: 'genderScope',
        header: ui('النطاق'),
        cell: ({ row }) => genderLabel(row.original.genderScope),
      },
      { accessorKey: 'paymentMethod', header: ui('طريقة الدفع') },
      { accessorKey: 'paymentStatus', header: ui('حالة الدفع') },
      { accessorKey: 'approvalStatus', header: ui('الموافقة') },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.approvalStatus === 'معلق' && (
              <>
                <Button
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
                </Button>
                <Button
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
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditId(row.original.id);
                const isSplit = row.original.nesba != null && row.original.mainValue != null;
                // nesba = نسبة هذا الصف نفسه؛ اشتقاق نسبة الرجالي دائماً بشكل صحيح
                // سواء تم الضغط على تعديل من صف الرجالي أو صف الحريمي
                const malePct = isSplit
                  ? (row.original.genderScope === 'female'
                      ? 100 - (row.original.nesba ?? 0)
                      : (row.original.nesba ?? 60))
                  : 60;
                setForm({
                  expenseDate: row.original.expenseDate?.slice(0, 10) ?? '',
                  category: row.original.category,
                  subCategory: row.original.subCategory ?? '',
                  amount: row.original.mainValue != null
                    ? String(row.original.mainValue)
                    : String(row.original.amount),
                  paymentMethod: row.original.paymentMethod,
                  paymentStatus: row.original.paymentStatus,
                  description: row.original.description ?? '',
                  vendor: row.original.vendor ?? '',
                  invoiceNumber: row.original.invoiceNumber ?? '',
                  receiptNumber: row.original.receiptNumber ?? '',
                  taxAmount: row.original.taxAmount != null ? String(row.original.taxAmount) : '',
                  notes: row.original.notes ?? '',
                  branchId: row.original.branchId != null ? String(row.original.branchId) : '',
                  genderScope: isSplit ? '' : (row.original.genderScope ?? ''),
                  hasPercentage: isSplit,
                  malePercentage: isSplit ? String(malePct) : '60',
                  femalePercentage: isSplit ? String(100 - malePct) : '40',
                });
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
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
            </Button>
          </div>
        ),
      },
    ],
    [params.page, params.pageSize, refetch, ui, actingId],
  );

  const submitReject = async () => {
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
    setForm({ ...EMPTY_FORM, expenseDate: localToday(), branchId: String(receptionOnly ? user?.branch ?? '' : branches?.[0]?.id ?? '') });
    setOpen(true);
  };

  const save = async () => {
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
    if (form.hasPercentage && !percentageValid) {
      toast.error(ui('مجموع نسبة الرجال والحريم يجب أن يساوي 100'));
      return;
    }

    const payload: ExpenseFormPayload = {
      expenseDate: form.expenseDate,
      category: form.category,
      subCategory: form.subCategory || undefined,
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod,
      paymentStatus: form.paymentStatus,
      description: form.description || undefined,
      vendor: form.vendor || undefined,
      invoiceNumber: form.invoiceNumber || undefined,
      receiptNumber: form.receiptNumber || undefined,
      taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
      notes: form.notes || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      ...(form.hasPercentage
        ? {
            hasPercentage: true,
            malePercentage: Number(form.malePercentage),
            femalePercentage: Number(form.femalePercentage),
          }
        : {
            genderScope: form.genderScope || undefined,
          }),
    };
    setSaving(true);
    try {
      if (editId != null) {
        await api.put(`/expenses/${editId}`, payload);
        toast.success(ui(form.hasPercentage ? 'تم تحديث الصفين (رجالي وحريمي)' : 'تم تحديث المصروف'));
      } else {
        await api.post('/expenses', payload);
        toast.success(ui(form.hasPercentage ? 'تم إنشاء صفين: رجالي وحريمي حسب النسبة' : 'تم إنشاء المصروف'));
      }
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinancePageShell title={ui('إدارة المصروفات')} description={receptionOnly ? `مصروفات اليوم ${localToday()} — ${user?.branch_name ?? 'فرعك'}` : ui('تسجيل ومتابعة واعتماد المصروفات')}>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setCatOpen(true)}>
          <Tag className="ms-1 h-4 w-4" />
          {ui('إدارة الأنواع')}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="ms-1 h-4 w-4" />
          {ui('مصروف جديد')}
        </Button>
      </div>
      <FilterBar fields={receptionOnly ? filters.filter((field) => field.key !== 'branchId') : filters} searchPlaceholder={ui('بحث في المصروفات…')} />
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
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل مصروف') : ui('مصروف جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('التاريخ')}</Label>
                <Input
                  className="nums"
                  type="date"
                  readOnly={receptionOnly}
                  value={form.expenseDate}
                  onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('الفرع')}</Label>
                <select
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('الفئة')}</Label>
                <select
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
                <Label>{ui('الفئة الفرعية')}</Label>
                <Input value={form.subCategory} onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label>{ui('المبلغ')}</Label>
                <Input
                  className="nums"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('طريقة الدفع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                >
                  {paymentMethodOptions.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{ui('حالة الدفع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.paymentStatus}
                  onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value }))}
                >
                  {paymentStatusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Gender Scope ── */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="grid gap-1">
                <Label>{ui('نطاق الجنس')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.hasPercentage ? '' : form.genderScope}
                  disabled={form.hasPercentage}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, genderScope: e.target.value as '' | 'male' | 'female' }))
                  }
                >
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {ui(o.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <input
                  id="has-percentage"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={form.hasPercentage}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      hasPercentage: e.target.checked,
                      genderScope: '',
                    }))
                  }
                />
                <Label htmlFor="has-percentage" className="cursor-pointer font-normal">
                  {ui('توزيع بالنسب (رجالي / حريمي)')}
                </Label>
              </div>
            </div>

            {/* ── Percentage Split ── */}
            {form.hasPercentage && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="mb-2 text-xs text-muted-foreground">
                  {ui('يتم إنشاء سجلين منفصلين: واحد للرجالي وآخر للحريمي حسب النسبة المحددة')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-sm">{ui('نسبة الرجالي')} (%)</Label>
                    <Input
                      className="nums"
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      value={form.malePercentage}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = Number(v);
                        setForm((f) => ({
                          ...f,
                          malePercentage: v,
                          femalePercentage: Number.isFinite(n) && n > 0 && n < 100
                            ? String(100 - n)
                            : f.femalePercentage,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-sm">{ui('نسبة الحريمي')} (%)</Label>
                    <Input
                      className="nums"
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      value={form.femalePercentage}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = Number(v);
                        setForm((f) => ({
                          ...f,
                          femalePercentage: v,
                          malePercentage: Number.isFinite(n) && n > 0 && n < 100
                            ? String(100 - n)
                            : f.malePercentage,
                        }));
                      }}
                    />
                  </div>
                </div>
                {form.amount && (
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {ui('الرجالي')}: {((Number(form.amount) * malePct) / 100).toFixed(2)}
                    </span>
                    <span>
                      {ui('الحريمي')}: {((Number(form.amount) * femalePct) / 100).toFixed(2)}
                    </span>
                    {!percentageValid && (
                      <span className="text-destructive font-medium">
                        {ui('المجموع يجب أن يساوي 100%')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('المورد')}</Label>
                <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('رقم الفاتورة')}</Label>
                <Input
                  className="nums"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الوصف')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label>{ui('ملاحظات')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving || (form.hasPercentage && !percentageValid)}>
              {ui('حفظ')}
            </Button>
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
            <Button variant="destructive" disabled={actingId != null} onClick={() => void submitReject()}>
              {ui('رفض')}
            </Button>
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
              <Button onClick={() => void addCategory()} disabled={catBusy || !newCat.trim()}>
                <Plus className="h-4 w-4" />
                {ui('إضافة')}
              </Button>
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
