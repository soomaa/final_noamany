import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Lock, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
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
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { indexColumn } from './simple-crud-tab';

interface OpeningStockRow {
  id: number;
  itemCode: string;
  quantity: number;
  unitCost: number;
  branchId: number;
  warehouseId: number;
}

const OPENING_EMPTY = {
  itemCode: '',
  productId: '',
  quantity: '1',
  unitCost: '0',
  notes: '',
};

export function OpeningStockTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<OpeningStockRow>(
    'opening-stocks',
    params,
  );

  const { data: products } = useQuery({
    queryKey: ['products', 'opening', user?.branch],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200, branchId: user?.branch || undefined },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(OPENING_EMPTY);
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<OpeningStockRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<OpeningStockRow>,
      { accessorKey: 'itemCode', header: ui('كود الصنف') },
      {
        accessorKey: 'quantity',
        header: ui('الكمية'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'unitCost',
        header: ui('تكلفة الوحدة'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
    ],
    [params.page, params.pageSize, ui],
  );

  const onProductPick = (productId: string) => {
    const p = products?.find((x) => x.id === Number(productId));
    setForm((f) => ({
      ...f,
      productId,
      itemCode: p?.productCode ?? f.itemCode,
      unitCost: String(p?.costPrice ?? f.unitCost),
    }));
  };

  const save = async () => {
    if (!form.itemCode || !user?.branch) {
      toast.error(ui('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    const quantityNum = Number(form.quantity);
    const unitCostNum = Number(form.unitCost);
    if (!Number.isFinite(quantityNum) || quantityNum < 0 || !Number.isFinite(unitCostNum) || unitCostNum < 0) {
      toast.error(ui('الكمية والتكلفة يجب أن تكون أرقاماً موجبة'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/opening-stocks', {
        itemCode: form.itemCode,
        productId: form.productId ? Number(form.productId) : undefined,
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost),
        notes: form.notes || undefined,
      });
      toast.success(ui('تم تسجيل بضاعة أول المدة'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ListPageShell
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
      actions={
        <Button
          onClick={() => {
            setForm(OPENING_EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('إضافة رصيد')}
        </Button>
      }
    >
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ui('بضاعة أول المدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{ui('المنتج')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.productId}
                onChange={(e) => onProductPick(e.target.value)}
              >
                <option value="">{ui('— أو أدخل الكود يدوياً —')}</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}{p.size ? ` — ${p.size}` : ''} ({p.productCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{ui('كود الصنف')}</Label>
              <Input value={form.itemCode} onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('الكمية')}</Label>
                <Input
                  type="number"
                  min={0}
                  className="nums"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('تكلفة الوحدة')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="nums"
                  value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الفرع')}</Label>
              <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>{user?.branch_name || (user?.branch ? `${ui('فرع رقم')} ${user.branch}` : ui('غير مرتبط بفرع'))}</span>
                <Lock className="size-4 text-muted-foreground" />
              </div>
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
    </ListPageShell>
  );
}

interface StockTakingRow {
  id: number;
  sessionNumber: string;
  warehouseId: number;
  branchId?: number | null;
  status: string;
  items?: Array<{
    id: number;
    itemName: string;
    systemQuantity: number;
    countedQuantity: number;
    variance: number;
  }>;
}

interface CountSessionDetail extends StockTakingRow {
  adjustmentId: number | null;
  adjustmentStatus: string | null;
  items: Array<{
    id: number;
    itemName: string;
    systemQuantity: number;
    countedQuantity: number;
    variance: number;
  }>;
}

export function StockTakingTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<StockTakingRow>(
    'stock-taking',
    params,
  );

  const { data: products } = useQuery({
    queryKey: ['products', 'stock-taking', user?.branch],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200, branchId: user?.branch || undefined },
      });
      return r.data;
    },
    enabled: !!user?.branch,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<CountSessionDetail | null>(null);
  const [countProductId, setCountProductId] = useState('');
  const [countedQty, setCountedQty] = useState('0');
  // In-flight guard so the add-item button can't be double-clicked into duplicate rows.
  const [addingItem, setAddingItem] = useState(false);

  const columns = useMemo<ColumnDef<StockTakingRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<StockTakingRow>,
      { accessorKey: 'sessionNumber', header: ui('رقم الجلسة') },
      { accessorKey: 'status', header: ui('الحالة') },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void openDetail(row.original.id)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [params.page, params.pageSize, ui],
  );

  const openDetail = async (id: number) => {
    try {
      const { data: detail } = await api.get<CountSessionDetail>(`/stock-taking/${id}`);
      setSessionId(id);
      setSessionDetail(detail);
      setDetailOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const createSession = async () => {
    if (!user?.branch) {
      toast.error(ui('حساب المستخدم غير مرتبط بفرع'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/stock-taking', {
        notes: notes || undefined,
      });
      toast.success(ui('تم إنشاء جلسة الجرد'));
      setCreateOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const addCountItem = async () => {
    if (!sessionId || !countProductId || addingItem) return;
    const p = products?.find((x) => x.id === Number(countProductId));
    setAddingItem(true);
    try {
      await api.post(`/stock-taking/${sessionId}/items`, {
        productId: Number(countProductId),
        itemCode: p?.productCode,
        itemName: p?.nameAr ?? ui('صنف'),
        countedQuantity: Number(countedQty),
      });
      toast.success(ui('تم إضافة البند'));
      await openDetail(sessionId);
      setCountProductId('');
      setCountedQty('0');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setAddingItem(false);
    }
  };

  const finalizeCount = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await api.post(`/stock-taking/${sessionId}/finalize`);
      toast.success(ui('تم إرسال الجرد للاعتماد'));
      await openDetail(sessionId);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const approveCount = async () => {
    if (!sessionId || !sessionDetail?.adjustmentId) return;
    setSaving(true);
    try {
      await api.post(`/stock-taking/adjustments/${sessionDetail.adjustmentId}/approve`);
      toast.success(ui('تم اعتماد الجرد وتحديث المخزون والقيد المحاسبي'));
      await openDetail(sessionId);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ListPageShell
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
      actions={
        <Button
          onClick={() => {
            setNotes('');
            setCreateOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('جلسة جرد جديدة')}
        </Button>
      }
    >
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('جلسة جرد جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{ui('الفرع')}</Label>
              <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>{user?.branch_name || (user?.branch ? `${ui('فرع رقم')} ${user.branch}` : ui('غير مرتبط بفرع'))}</span>
                <Lock className="size-4 text-muted-foreground" />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('ملاحظات')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void createSession()} disabled={saving}>
              {ui('إنشاء')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {ui('جلسة')} {sessionDetail?.sessionNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-start">{ui('الصنف')}</th>
                    <th className="p-2">{ui('النظام')}</th>
                    <th className="p-2">{ui('المعد')}</th>
                    <th className="p-2">{ui('الفرق')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessionDetail?.items ?? []).map((i) => (
                    <tr key={i.id} className="border-b">
                      <td className="p-2">{i.itemName}</td>
                      <td className="nums p-2 text-center">{toArabicDigits(i.systemQuantity)}</td>
                      <td className="nums p-2 text-center">{toArabicDigits(i.countedQuantity)}</td>
                      <td className="nums p-2 text-center">{toArabicDigits(i.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sessionDetail?.status === 'draft' && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="min-w-[200px] flex-1">
                  <Label>{ui('منتج')}</Label>
                  <select
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={countProductId}
                    onChange={(e) => setCountProductId(e.target.value)}
                  >
                    <option value="">{ui('—')}</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}{p.size ? ` — ${p.size}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label>{ui('الكمية المعدودة')}</Label>
                  <Input
                    type="number"
                    className="nums mt-1"
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                  />
                </div>
                <Button onClick={() => void addCountItem()} disabled={addingItem}>
                  <Check className="ms-1 h-4 w-4" />
                  {ui('إضافة')}
                </Button>
              </div>
            )}
            {sessionDetail?.status === 'draft' && (
              <div className="flex justify-end border-t pt-3">
                <Button variant="brand" onClick={() => void finalizeCount()} disabled={saving || !sessionDetail.items.length}>
                  {ui('إنهاء الجرد وإرساله للاعتماد')}
                </Button>
              </div>
            )}
            {sessionDetail?.status === 'awaiting_approval' && sessionDetail.adjustmentId && (
              <div className="flex justify-end border-t pt-3">
                <Button variant="brand" onClick={() => void approveCount()} disabled={saving}>
                  <Check className="ms-1 h-4 w-4" />
                  {ui('اعتماد التسوية وتحديث المخزون')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
