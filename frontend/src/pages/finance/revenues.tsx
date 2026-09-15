import type { ColumnDef } from '@tanstack/react-table';
import { Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { normalizeRevenueSync } from '@/lib/finance-api';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import {
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  REVENUE_SOURCE_VALUES,
  financeOptions,
  type RevenueFormPayload,
  type RevenueRow,
  type RevenueSyncResult,
} from '@/types/finance';
import { useLocale } from '@/store/locale';
import { indexColumn } from '../inventory/simple-crud-tab';
import { FinancePageShell } from './finance-shell';

const EMPTY_FORM = {
  revenueDate: '',
  source: '',
  subSource: '',
  amount: '',
  // Canonical stored values (Arabic) — locale-independent, matches backend literals.
  paymentMethod: 'نقدي',
  paymentStatus: 'مدفوع',
  description: '',
  customerName: '',
  invoiceNumber: '',
  receiptNumber: '',
  taxAmount: '',
  discountAmount: '',
  notes: '',
  branchId: '',
};

export function FinanceRevenuesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<RevenueRow>('revenues', params);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [syncStart, setSyncStart] = useState(() => localToday());
  const [syncEnd, setSyncEnd] = useState(() => localToday());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<RevenueSyncResult | null>(null);

  const sourceOptions = financeOptions(REVENUE_SOURCE_VALUES);
  const paymentMethodOptions = financeOptions(PAYMENT_METHOD_VALUES);
  const paymentStatusOptions = financeOptions(PAYMENT_STATUS_VALUES);

  const filters: FilterField[] = [
    {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
    {
      key: 'source',
      label: ui('المصدر'),
      type: 'select',
      options: sourceOptions,
    },
    {
      key: 'paymentStatus',
      label: ui('حالة الدفع'),
      type: 'select',
      options: paymentStatusOptions,
    },
  ];

  const columns = useMemo<ColumnDef<RevenueRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<RevenueRow>,
      {
        accessorKey: 'revenueDate',
        header: ui('التاريخ'),
        cell: ({ getValue }) => <span className="nums">{getValue() as string}</span>,
      },
      { accessorKey: 'source', header: ui('المصدر') },
      { accessorKey: 'customerName', header: ui('العميل'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'amount',
        header: ui('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number).toFixed(2))}</span>,
      },
      { accessorKey: 'paymentMethod', header: ui('طريقة الدفع') },
      { accessorKey: 'paymentStatus', header: ui('حالة الدفع') },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditId(row.original.id);
                setForm({
                  revenueDate: row.original.revenueDate?.slice(0, 10) ?? '',
                  source: row.original.source,
                  subSource: row.original.subSource ?? '',
                  amount: String(row.original.amount),
                  paymentMethod: row.original.paymentMethod,
                  paymentStatus: row.original.paymentStatus,
                  description: row.original.description ?? '',
                  customerName: row.original.customerName ?? '',
                  invoiceNumber: row.original.invoiceNumber ?? '',
                  receiptNumber: row.original.receiptNumber ?? '',
                  taxAmount: row.original.taxAmount != null ? String(row.original.taxAmount) : '',
                  discountAmount: row.original.discountAmount != null ? String(row.original.discountAmount) : '',
                  notes: row.original.notes ?? '',
                  branchId: row.original.branchId != null ? String(row.original.branchId) : '',
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
                if (!(await confirm({ title: ui('حذف هذا الإيراد؟') }))) return;
                try {
                  await api.delete(`/revenues/${row.original.id}`);
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
    [params.page, params.pageSize, refetch, ui],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, revenueDate: localToday(), branchId: String(branches?.[0]?.id ?? '') });
    setOpen(true);
  };

  const save = async () => {
    if (!form.source || !form.amount) {
      toast.error(ui('يرجى تعبئة المصدر والمبلغ'));
      return;
    }
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error(ui('المبلغ يجب أن يكون رقماً موجباً'));
      return;
    }
    if (
      (form.taxAmount && Number(form.taxAmount) < 0) ||
      (form.discountAmount && Number(form.discountAmount) < 0)
    ) {
      toast.error(ui('المبلغ يجب أن يكون رقماً موجباً'));
      return;
    }
    const payload: RevenueFormPayload = {
      revenueDate: form.revenueDate,
      source: form.source,
      subSource: form.subSource || undefined,
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod,
      paymentStatus: form.paymentStatus,
      description: form.description || undefined,
      customerName: form.customerName || undefined,
      invoiceNumber: form.invoiceNumber || undefined,
      receiptNumber: form.receiptNumber || undefined,
      taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
      discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
      notes: form.notes || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
    };
    setSaving(true);
    try {
      if (editId != null) {
        await api.put(`/revenues/${editId}`, payload);
        toast.success(ui('تم تحديث الإيراد'));
      } else {
        await api.post('/revenues', payload);
        toast.success(ui('تم إنشاء الإيراد'));
      }
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const syncRevenues = async () => {
    setSyncing(true);
    try {
      const { data: res } = await api.post<Record<string, unknown>>('/revenues/sync', {
        startDate: syncStart,
        endDate: syncEnd,
      });
      setSyncResult(normalizeRevenueSync(res));
      toast.success(ui('تمت المزامنة'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <FinancePageShell title={ui('إدارة الإيرادات')} description={ui('تسجيل ومتابعة الإيرادات ومزامنتها من أنظمة الجيم')}>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <h3 className="mb-3 font-semibold">{ui('مزامنة الإيرادات من الجيم والمبيعات')}</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <Label className="text-xs">{ui('من تاريخ')}</Label>
              <Input className="nums" type="date" value={syncStart} onChange={(e) => setSyncStart(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{ui('إلى تاريخ')}</Label>
              <Input className="nums" type="date" value={syncEnd} onChange={(e) => setSyncEnd(e.target.value)} />
            </div>
            <Button onClick={() => void syncRevenues()} disabled={syncing}>
              {syncing ? <RefreshCw className="ms-1 h-4 w-4 animate-spin" /> : <Download className="ms-1 h-4 w-4" />}
              {ui('مزامنة الإيرادات')}
            </Button>
          </div>
          {syncResult && (
            <p className="mt-3 text-sm text-muted-foreground">
              {ui('أُضيف')}: {toArabicDigits(syncResult.syncedCount ?? 0)} · {ui('موجود مسبقاً')}:{' '}
              {toArabicDigits(syncResult.skippedCount ?? 0)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="ms-1 h-4 w-4" />
          {ui('إيراد جديد')}
        </Button>
      </div>
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في الإيرادات…')} />
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
            <DialogTitle>{editId != null ? ui('تعديل إيراد') : ui('إيراد جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('التاريخ')}</Label>
                <Input
                  className="nums"
                  type="date"
                  value={form.revenueDate}
                  onChange={(e) => setForm((f) => ({ ...f, revenueDate: e.target.value }))}
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
                <Label>{ui('المصدر')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                >
                  <option value="">{ui('اختر المصدر')}</option>
                  {sourceOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{ui('المصدر الفرعي')}</Label>
                <Input value={form.subSource} onChange={(e) => setForm((f) => ({ ...f, subSource: e.target.value }))} />
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('العميل')}</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('رقم الإيصال')}</Label>
                <Input
                  className="nums"
                  value={form.receiptNumber}
                  onChange={(e) => setForm((f) => ({ ...f, receiptNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الوصف')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinancePageShell>
  );
}
