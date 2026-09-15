import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, CheckCircle2, Eye, Lock, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { usePermission } from '@/hooks/use-permission';
import { useBranches } from '@/hooks/use-branches';
import { resolveStockTakingCreateBranch } from '@/lib/stock-taking-branch';
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

interface StockTakingItem {
  id: number;
  productId?: number | null;
  itemName: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  varianceReason?: string | null;
}

interface StockTakingRow {
  id: number;
  sessionNumber: string;
  warehouseId: number;
  branchId?: number | null;
  status: string;
  items?: StockTakingItem[];
}

interface CountSessionDetail extends StockTakingRow {
  adjustmentId: number | null;
  adjustmentStatus: string | null;
  items: StockTakingItem[];
}

export function StockTakingTab({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canCreate = can('gym-sales.inventory.stock_taking:create');
  const canUpdate = can('gym-sales.inventory.stock_taking:update');
  const canApprove = can('gym-sales.inventory.stock_taking:approve');
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
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

  const [notes, setNotes] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const wasCreateOpen = useRef(false);

  useEffect(() => {
    if (createOpen && !wasCreateOpen.current) {
      setNotes('');
      setSelectedBranchId(user?.branch
        ? String(user.branch)
        : branches.length === 1
          ? String(branches[0].id)
          : '');
    }
    wasCreateOpen.current = createOpen;
  }, [branches, createOpen, user?.branch]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<CountSessionDetail | null>(null);
  const [countProductId, setCountProductId] = useState('');
  const [countedQty, setCountedQty] = useState('0');
  const [varianceReason, setVarianceReason] = useState('');
  // In-flight guard so the add-item button can't be double-clicked into duplicate rows.
  const [addingItem, setAddingItem] = useState(false);

  const selectedCountProduct = products?.find((product) => product.id === Number(countProductId));
  const countedQuantityNumber = Number(countedQty);
  const systemQuantityNumber = Number(selectedCountProduct?.currentStock ?? 0);
  const draftVariance = Number.isFinite(countedQuantityNumber)
    ? countedQuantityNumber - systemQuantityNumber
    : 0;

  const countSummary = useMemo(() => {
    const costByProduct = new Map((products ?? []).map((product) => [product.id, product.costPrice]));
    return (sessionDetail?.items ?? []).reduce(
      (summary, item) => {
        const quantity = Math.abs(item.variance);
        const value = quantity * (costByProduct.get(item.productId ?? -1) ?? 0);
        if (item.variance < 0) {
          summary.shortageItems += 1;
          summary.shortageQuantity += quantity;
          summary.shortageValue += value;
        } else if (item.variance > 0) {
          summary.surplusItems += 1;
          summary.surplusQuantity += quantity;
          summary.surplusValue += value;
        } else {
          summary.matchedItems += 1;
        }
        return summary;
      },
      {
        shortageItems: 0,
        shortageQuantity: 0,
        shortageValue: 0,
        surplusItems: 0,
        surplusQuantity: 0,
        surplusValue: 0,
        matchedItems: 0,
      },
    );
  }, [products, sessionDetail]);

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
            aria-label={ui('عرض تفاصيل جلسة الجرد')}
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
    navigate(`/club/cafe/stock-taking/${id}`);
  };

  const createSession = async () => {
    if (!canCreate) return;
    const branchId = resolveStockTakingCreateBranch(user?.branch, selectedBranchId);
    if (!branchId) {
      toast.error(ui('اختر الفرع الذي سيتم جرده'));
      return;
    }
    setSaving(true);
    try {
      const { data: created } = await api.post<CountSessionDetail>('/stock-taking', {
        branchId,
        notes: notes || undefined,
      });
      toast.success(ui('تم إنشاء جلسة الجرد'));
      onCreateOpenChange(false);
      void refetch();
      navigate(`/club/cafe/stock-taking/${created.id}`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const addCountItem = async () => {
    if (!canCreate || !sessionId || !countProductId || addingItem) return;
    const p = products?.find((x) => x.id === Number(countProductId));
    const physicalQuantity = Number(countedQty);
    if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) {
      toast.error(ui('أدخل كمية فعلية صحيحة لا تقل عن صفر'));
      return;
    }
    const variance = physicalQuantity - Number(p?.currentStock ?? 0);
    if (variance !== 0 && !varianceReason.trim()) {
      toast.error(ui('اكتب سبب العجز أو الزيادة قبل إضافة الصنف'));
      return;
    }
    setAddingItem(true);
    try {
      await api.post(`/stock-taking/${sessionId}/items`, {
        productId: Number(countProductId),
        itemCode: p?.productCode,
        itemName: p?.nameAr ?? ui('صنف'),
        countedQuantity: physicalQuantity,
        varianceReason: varianceReason.trim() || undefined,
      });
      toast.success(ui('تم إضافة البند'));
      await openDetail(sessionId);
      setCountProductId('');
      setCountedQty('0');
      setVarianceReason('');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setAddingItem(false);
    }
  };

  const finalizeCount = async () => {
    if (!canUpdate || !sessionId) return;
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
    if (!canApprove || !sessionId || !sessionDetail?.adjustmentId) return;
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

      <Dialog open={createOpen && canCreate} onOpenChange={onCreateOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('جلسة جرد جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="stock-taking-branch">{ui('الفرع')} <span className="text-destructive">*</span></Label>
              {user?.branch ? (
                <div className="flex min-h-11 items-center justify-between rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                  <span>{user.branch_name || `${ui('فرع رقم')} ${user.branch}`}</span>
                  <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                <select
                  id="stock-taking-branch"
                  className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={selectedBranchId}
                  disabled={branchesLoading || saving}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                >
                  <option value="">{branchesLoading ? ui('جاري تحميل الفروع…') : ui('اختر الفرع')}</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name || `${ui('فرع رقم')} ${branch.id}`}</option>)}
                </select>
              )}
              {!user?.branch && !branchesLoading && branches.length === 0 ? (
                <p className="text-sm text-destructive">{ui('لا توجد فروع متاحة لحسابك. راجع صلاحيات الفروع.')}</p>
              ) : null}
            </div>
            <div className="grid gap-1">
              <Label>{ui('ملاحظات')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              permissionAction="create"
              onClick={() => void createSession()}
              disabled={saving || (!user?.branch && branchesLoading) || !resolveStockTakingCreateBranch(user?.branch, selectedBranchId)}
            >
              {saving ? ui('جاري الإنشاء…') : ui('إنشاء وبدء الجرد')}
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
            {!!sessionDetail?.items.length && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <TrendingDown className="size-4" aria-hidden="true" />
                    {ui('عجز')}
                  </div>
                  <p className="nums mt-2 text-xl font-semibold">
                    {toArabicDigits(countSummary.shortageItems)} {ui('صنف')}
                  </p>
                  <p className="nums mt-1 text-xs text-muted-foreground">
                    {ui('فرق كمية')}: {toArabicDigits(countSummary.shortageQuantity)} · {ui('قيمة تقديرية')}: {toArabicDigits(countSummary.shortageValue.toFixed(2))} {ui('ج.م')}
                  </p>
                </div>
                <div className="rounded-lg border border-success/20 bg-success/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <TrendingUp className="size-4" aria-hidden="true" />
                    {ui('زيادة')}
                  </div>
                  <p className="nums mt-2 text-xl font-semibold">
                    {toArabicDigits(countSummary.surplusItems)} {ui('صنف')}
                  </p>
                  <p className="nums mt-1 text-xs text-muted-foreground">
                    {ui('فرق كمية')}: {toArabicDigits(countSummary.surplusQuantity)} · {ui('قيمة تقديرية')}: {toArabicDigits(countSummary.surplusValue.toFixed(2))} {ui('ج.م')}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    {ui('مطابق')}
                  </div>
                  <p className="nums mt-2 text-xl font-semibold">
                    {toArabicDigits(countSummary.matchedItems)} {ui('صنف')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{ui('بدون أي فرق في الكمية')}</p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="p-3 text-start">{ui('الصنف')}</th>
                    <th scope="col" className="p-3">{ui('النظام')}</th>
                    <th scope="col" className="p-3">{ui('الفعلي')}</th>
                    <th scope="col" className="p-3">{ui('الفرق')}</th>
                    <th scope="col" className="p-3">{ui('النتيجة')}</th>
                    <th scope="col" className="p-3 text-start">{ui('سبب الفرق')}</th>
                    <th scope="col" className="p-3">{ui('القيمة التقديرية')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessionDetail?.items ?? []).map((i) => {
                    const unitCost = products?.find((product) => product.id === i.productId)?.costPrice;
                    const varianceValue = unitCost == null ? null : Math.abs(i.variance) * unitCost;
                    return (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{i.itemName}</td>
                        <td className="nums p-3 text-center">{toArabicDigits(i.systemQuantity)}</td>
                        <td className="nums p-3 text-center">{toArabicDigits(i.countedQuantity)}</td>
                        <td className={`nums p-3 text-center font-semibold ${i.variance < 0 ? 'text-destructive' : i.variance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                          {i.variance > 0 ? '+' : ''}{toArabicDigits(i.variance)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={i.variance < 0 ? 'destructive' : i.variance > 0 ? 'success' : 'secondary'}>
                            {i.variance < 0 ? ui('عجز') : i.variance > 0 ? ui('زيادة') : ui('مطابق')}
                          </Badge>
                        </td>
                        <td className="max-w-[240px] p-3 text-start text-muted-foreground">
                          {i.varianceReason || ui('لا يوجد فرق')}
                        </td>
                        <td className="nums p-3 text-center">
                          {varianceValue == null ? ui('—') : `${toArabicDigits(varianceValue.toFixed(2))} ${ui('ج.م')}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sessionDetail?.status === 'draft' && canCreate && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_120px_130px_130px]">
                  <div>
                  <Label htmlFor="stock-count-product">{ui('منتج')}</Label>
                  <select
                    id="stock-count-product"
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={countProductId}
                    onChange={(e) => {
                      setCountProductId(e.target.value);
                      setVarianceReason('');
                    }}
                  >
                    <option value="">{ui('—')}</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}{p.size ? ` — ${p.size}` : ''}
                      </option>
                    ))}
                  </select>
                  </div>
                  <div>
                    <Label>{ui('كمية النظام')}</Label>
                    <div className="nums mt-1 flex h-10 items-center justify-center rounded-md border bg-background px-3 text-sm">
                      {countProductId ? toArabicDigits(systemQuantityNumber) : ui('—')}
                    </div>
                  </div>
                  <div>
                  <Label htmlFor="stock-count-quantity">{ui('الكمية المعدودة')}</Label>
                  <Input
                    id="stock-count-quantity"
                    type="number"
                    min="0"
                    step="0.001"
                    className="nums mt-1"
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                  />
                  </div>
                  <div>
                    <Label>{ui('الفرق')}</Label>
                    <div className="mt-1 flex h-10 items-center justify-center rounded-md border bg-background px-3">
                      {!countProductId ? (
                        <span className="text-sm text-muted-foreground">{ui('—')}</span>
                      ) : (
                        <Badge variant={draftVariance < 0 ? 'destructive' : draftVariance > 0 ? 'success' : 'secondary'}>
                          <span className="nums">{draftVariance > 0 ? '+' : ''}{toArabicDigits(draftVariance)}</span>
                          {draftVariance < 0 ? ui('عجز') : draftVariance > 0 ? ui('زيادة') : ui('مطابق')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="stock-variance-reason">
                      {ui('سبب الفرق')}
                      {countProductId && draftVariance !== 0 && <span className="ms-1 text-destructive">*</span>}
                    </Label>
                    <Input
                      id="stock-variance-reason"
                      className="mt-1"
                      maxLength={255}
                      placeholder={ui('مثال: كسر، هالك، خطأ تسجيل، أو استلام غير مسجل')}
                      value={varianceReason}
                      onChange={(e) => setVarianceReason(e.target.value)}
                    />
                  </div>
                  <Button permissionAction="create" onClick={() => void addCountItem()} disabled={addingItem || !countProductId}>
                    <Check className="ms-1 h-4 w-4" />
                    {ui('إضافة نتيجة العد')}
                  </Button>
                </div>
              </div>
            )}
            {sessionDetail?.status === 'draft' && canUpdate && (
              <div className="flex justify-end border-t pt-3">
                <Button permissionAction="update" variant="brand" onClick={() => void finalizeCount()} disabled={saving || !sessionDetail.items.length}>
                  {ui('إنهاء الجرد وإرساله للاعتماد')}
                </Button>
              </div>
            )}
            {sessionDetail?.status === 'awaiting_approval' && sessionDetail.adjustmentId && canApprove && (
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">{ui('راجع فروقات الجرد قبل الاعتماد')}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {ui('سيتم تطبيق العجز أو الزيادة على الرصيد الحالي مع الحفاظ على أي حركات مخزون سُجلت بعد وقت العد.')}
                    </p>
                  </div>
                </div>
                <Button className="shrink-0" permissionAction="approve" variant="brand" onClick={() => void approveCount()} disabled={saving}>
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
