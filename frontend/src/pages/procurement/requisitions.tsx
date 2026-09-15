import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Send, X } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { QuotationRow, RequisitionRow, RfqRow } from '@/types/gym-sales';
import type { NamedEntity } from '@/types/inventory';
import type { PaginatedResponse } from '@/components/common/data-table';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { uiStatic } from '@/lib/ui-static';

type ReqTab = 'requisitions' | 'rfqs' | 'quotations' | 'approvals';

interface LineDraft {
  name: string;
  quantity: string;
  unit: string;
  estimatedPrice: string;
}

const EMPTY_REQ = {
  requestingDepartment: '',
  requiredDate: '',
  priority: 'normal',
  branchId: '',
  notes: '',
};

const EMPTY_RFQ = {
  subject: '',
  requestingDepartment: '',
  requiredDate: '',
  branchId: '',
  estimatedBudget: '',
};

const EMPTY_QUOTE = {
  rfqId: '',
  supplierId: '',
  totalPrice: '',
  deliveryTime: '',
  paymentTerms: '',
};

function RequisitionsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<RequisitionRow>('requisitions', params);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_REQ);
  const [lines, setLines] = useState<LineDraft[]>([{ name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }]);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const filters: FilterField[] = [
    {
      key: 'branchId',
      label: uiStatic('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
  ];

  const submit = async (id: number) => {
    if (submittingId !== null) return;
    setSubmittingId(id);
    try {
      await api.post(`/requisitions/${id}/submit`);
      toast.success(uiStatic('تم إرسال الطلب للموافقة'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmittingId(null);
    }
  };

  const columns = useMemo<ColumnDef<RequisitionRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<RequisitionRow>,
      { accessorKey: 'requestNumber', header: uiStatic('رقم الطلب') },
      { accessorKey: 'requestingDepartment', header: uiStatic('القسم') },
      { accessorKey: 'priority', header: uiStatic('الأولوية') },
      { accessorKey: 'status', header: uiStatic('الحالة') },
      {
        accessorKey: 'estimatedValue',
        header: uiStatic('القيمة التقديرية'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null | undefined;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        id: 'actions',
        header: uiStatic('الإجراءات'),
        cell: ({ row }) =>
          row.original.status === 'draft' ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={submittingId !== null}
              onClick={() => void submit(row.original.id)}
            >
              <Send className="h-4 w-4" />
            </Button>
          ) : null,
      },
    ],
    [params.page, params.pageSize, submittingId, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.name.trim() && Number(l.quantity) > 0);
    if (!form.requestingDepartment || !form.branchId || !validLines.length) {
      toast.error(uiStatic('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/requisitions', {
        requestingDepartment: form.requestingDepartment,
        requiredDate: form.requiredDate || undefined,
        priority: form.priority,
        branchId: Number(form.branchId),
        items: validLines.map((l) => ({
          name: l.name,
          quantity: Number(l.quantity),
          unit: l.unit || undefined,
          estimatedPrice: Number(l.estimatedPrice) || 0,
        })),
      });
      toast.success(uiStatic('تم إنشاء طلب الشراء'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setForm({ ...EMPTY_REQ, branchId: String(branches?.[0]?.id ?? '') });
            setLines([{ name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('طلب جديد')}
        </Button>
      </div>
      <FilterBar fields={filters} searchPlaceholder={uiStatic('بحث في طلبات الشراء…')} />
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
            <DialogTitle>{uiStatic('طلب شراء جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('القسم الطالب')}</Label>
                <Input
                  value={form.requestingDepartment}
                  onChange={(e) => setForm((f) => ({ ...f, requestingDepartment: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('الفرع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                >
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
                <Label>{uiStatic('تاريخ الاحتياج')}</Label>
                <Input
                  type="date"
                  value={form.requiredDate}
                  onChange={(e) => setForm((f) => ({ ...f, requiredDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('الأولوية')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  <option value="low">{uiStatic('منخفضة')}</option>
                  <option value="normal">{uiStatic('عادية')}</option>
                  <option value="high">{uiStatic('عالية')}</option>
                  <option value="urgent">{uiStatic('عاجلة')}</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{uiStatic('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2">
                  <Input
                    className="col-span-2"
                    placeholder={uiStatic('البند')}
                    value={line.name}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], name: e.target.value };
                        return next;
                      });
                    }}
                  />
                  <Input
                    type="number"
                    className="nums"
                    placeholder={uiStatic('كمية')}
                    value={line.quantity}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], quantity: e.target.value };
                        return next;
                      });
                    }}
                  />
                  <Input
                    type="number"
                    className="nums"
                    placeholder={uiStatic('سعر تقديري')}
                    value={line.estimatedPrice}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], estimatedPrice: e.target.value };
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }])
                }
              >
                {uiStatic('إضافة بند')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RfqsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<RfqRow>('rfqs', params);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_RFQ);
  const [lines, setLines] = useState<LineDraft[]>([{ name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }]);
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<RfqRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<RfqRow>,
      { accessorKey: 'rfqNumber', header: uiStatic('رقم RFQ') },
      { accessorKey: 'subject', header: uiStatic('الموضوع') },
      { accessorKey: 'requestingDepartment', header: uiStatic('القسم') },
      { accessorKey: 'status', header: uiStatic('الحالة') },
      {
        accessorKey: 'estimatedBudget',
        header: uiStatic('الميزانية'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null | undefined;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
    ],
    [params.page, params.pageSize, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.name.trim() && Number(l.quantity) > 0);
    if (!form.subject || !form.requestingDepartment || !form.branchId || !validLines.length) {
      toast.error(uiStatic('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/rfqs', {
        subject: form.subject,
        requestingDepartment: form.requestingDepartment,
        requiredDate: form.requiredDate || undefined,
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : undefined,
        branchId: Number(form.branchId),
        items: validLines.map((l) => ({
          itemName: l.name,
          quantity: Number(l.quantity),
          unit: l.unit || undefined,
          estimatedPrice: Number(l.estimatedPrice) || 0,
        })),
      });
      toast.success(uiStatic('تم إنشاء طلب عرض السعر'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setForm({ ...EMPTY_RFQ, branchId: String(branches?.[0]?.id ?? '') });
            setLines([{ name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('RFQ جديد')}
        </Button>
      </div>
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
            <DialogTitle>{uiStatic('طلب عرض سعر جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('الموضوع')}</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('القسم')}</Label>
                <Input
                  value={form.requestingDepartment}
                  onChange={(e) => setForm((f) => ({ ...f, requestingDepartment: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('الفرع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('الميزانية التقديرية')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={form.estimatedBudget}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedBudget: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{uiStatic('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <Input
                    className="col-span-2"
                    placeholder={uiStatic('البند')}
                    value={line.name}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], name: e.target.value };
                        return next;
                      });
                    }}
                  />
                  <Input
                    type="number"
                    className="nums"
                    placeholder={uiStatic('كمية')}
                    value={line.quantity}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], quantity: e.target.value };
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { name: '', quantity: '1', unit: uiStatic('قطعة'), estimatedPrice: '0' }])
                }
              >
                {uiStatic('إضافة بند')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuotationsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<QuotationRow>('quotations', params);
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });
  const { data: rfqs } = useQuery({
    queryKey: ['rfqs', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<RfqRow>>('/rfqs', { params: { page: 1, pageSize: 200 } });
      return r.data;
    },
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_QUOTE);
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<QuotationRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<QuotationRow>,
      { accessorKey: 'rfqId', header: uiStatic('RFQ') },
      { accessorKey: 'supplierId', header: uiStatic('المورد') },
      {
        accessorKey: 'totalPrice',
        header: uiStatic('السعر'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'deliveryTime', header: uiStatic('مدة التسليم'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'status', header: uiStatic('الحالة') },
    ],
    [params.page, params.pageSize, ui],
  );

  const save = async () => {
    if (!form.rfqId || !form.supplierId || !form.totalPrice) {
      toast.error(uiStatic('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/quotations', {
        rfqId: Number(form.rfqId),
        supplierId: Number(form.supplierId),
        totalPrice: Number(form.totalPrice),
        deliveryTime: form.deliveryTime || undefined,
        paymentTerms: form.paymentTerms || undefined,
      });
      toast.success(uiStatic('تم تسجيل عرض السعر'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('عرض سعر جديد')}
        </Button>
      </div>
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
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{uiStatic('تسجيل عرض سعر')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{uiStatic('طلب عرض السعر')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.rfqId}
                onChange={(e) => setForm((f) => ({ ...f, rfqId: e.target.value }))}
              >
                <option value="">{uiStatic('—')}</option>
                {(rfqs ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rfqNumber} — {r.subject}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
              >
                <option value="">{uiStatic('—')}</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('السعر الإجمالي')}</Label>
              <Input
                type="number"
                className="nums"
                value={form.totalPrice}
                onChange={(e) => setForm((f) => ({ ...f, totalPrice: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('مدة التسليم')}</Label>
              <Input
                value={form.deliveryTime}
                onChange={(e) => setForm((f) => ({ ...f, deliveryTime: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovalsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { status: 'pending' } });
  const { data, isLoading, isError, refetch } = usePaginatedList<RequisitionRow>('approvals', params);
  const [actingId, setActingId] = useState<number | null>(null);

  const act = async (id: number, action: 'approve' | 'reject') => {
    if (actingId !== null) return;
    setActingId(id);
    try {
      await api.post(`/approvals/${id}`, { action });
      toast.success(action === 'approve' ? uiStatic('تمت الموافقة') : uiStatic('تم الرفض'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActingId(null);
    }
  };

  const columns = useMemo<ColumnDef<RequisitionRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<RequisitionRow>,
      { accessorKey: 'requestNumber', header: uiStatic('رقم الطلب') },
      { accessorKey: 'requestingDepartment', header: uiStatic('القسم') },
      { accessorKey: 'priority', header: uiStatic('الأولوية') },
      {
        accessorKey: 'estimatedValue',
        header: uiStatic('القيمة'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null | undefined;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        id: 'actions',
        header: uiStatic('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={actingId !== null}
              onClick={() => void act(row.original.id, 'approve')}
            >
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={actingId !== null}
              onClick={() => void act(row.original.id, 'reject')}
            >
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [actingId, params.page, params.pageSize, ui],
  );

  return (
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
      emptyTitle={uiStatic('لا توجد موافقات معلقة')}
    />
  );
}

export function ProcurementRequisitionsPage() {
  const { ui } = useLocale();
  const [tab, setTab] = useState<ReqTab>('requisitions');

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('طلبات الشراء')}
      description={ui('طلبات الشراء وعروض الأسعار والموافقات')}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReqTab)} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="requisitions">{ui('طلبات الشراء')}</TabsTrigger>
          <TabsTrigger value="rfqs">{ui('طلبات عروض الأسعار')}</TabsTrigger>
          <TabsTrigger value="quotations">{ui('عروض الأسعار')}</TabsTrigger>
          <TabsTrigger value="approvals">{ui('الموافقات المعلقة')}</TabsTrigger>
        </TabsList>
        <TabsContent value="requisitions">
          <RequisitionsTab />
        </TabsContent>
        <TabsContent value="rfqs">
          <RfqsTab />
        </TabsContent>
        <TabsContent value="quotations">
          <QuotationsTab />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
      </Tabs>
    </GymSalesPageShell>
  );
}
