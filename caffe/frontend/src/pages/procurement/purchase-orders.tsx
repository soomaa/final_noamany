import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { StatCard } from '@/components/common/stat-card';
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
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { GYM_SALES_ROUTES } from '@/lib/gym-sales-routes';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { PurchaseOrderRow, QuickPoStatistics } from '@/types/gym-sales';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

interface PoLineDraft {
  productId: string;
  name: string;
  quantity: string;
  price: string;
}

export function ProcurementPurchaseOrdersPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseOrderRow>('purchase-orders', params);

  const { data: quickStats, isLoading: statsLoading } = useQuery({
    queryKey: ['quick-purchase-orders', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<QuickPoStatistics>('/quick-purchase-orders/statistics');
      return s;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'po-options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PoLineDraft[]>([{ productId: '', name: '', quantity: '1', price: '0' }]);
  const [saving, setSaving] = useState(false);

  const filters: FilterField[] = [
  {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
  ];

  const columns = useMemo<ColumnDef<PurchaseOrderRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<PurchaseOrderRow>,
      { accessorKey: 'poNumber', header: ui('رقم الأمر') },
      { accessorKey: 'supplierId', header: ui('المورد') },
      {
        accessorKey: 'totalAmount',
        header: ui('الإجمالي'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'status', header: ui('الحالة') },
      { accessorKey: 'expectedDeliveryDate', header: ui('التسليم المتوقع'), cell: ({ getValue }) => getValue() ?? '—' },
    ],
    [params.page, params.pageSize, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!supplierId || !branchId || !validLines.length) {
      toast.error(ui('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        supplierId: Number(supplierId),
        branchId: Number(branchId),
        paymentTerms: paymentTerms || undefined,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        notes: notes || undefined,
        items: validLines.map((l) => ({
          productId: Number(l.productId),
          name: l.name,
          quantity: Number(l.quantity),
          price: Number(l.price) || 0,
        })),
      });
      toast.success(ui('تم إنشاء أمر الشراء'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('أوامر الشراء')}
      description={ui('إدارة أوامر الشراء الرسمية وربطها بطلبات الشراء')}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={GYM_SALES_ROUTES.procurement.quickPo}>
              <ExternalLink className="ms-1 h-4 w-4" />
              {ui('أمر شراء سريع')}
            </Link>
          </Button>
          <Button
            onClick={() => {
              setSupplierId('');
              setBranchId(String(branches?.[0]?.id ?? ''));
              setPaymentTerms('');
              setExpectedDeliveryDate('');
              setNotes('');
              setLines([{ productId: '', name: '', quantity: '1', price: '0' }]);
              setOpen(true);
            }}
          >
            <Plus className="ms-1 h-4 w-4" />
            {ui('أمر جديد')}
          </Button>
        </div>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ui('أوامر الشراء السريعة')}
          value={statsLoading ? '…' : toArabicDigits(quickStats?.totalOrders ?? 0)}
          subtitle={ui('إجمالي')}
          loading={statsLoading}
        />
        <StatCard
          title={ui('قيمة الأوامر السريعة')}
          value={statsLoading ? '…' : toArabicDigits(Math.round(quickStats?.totalAmount ?? 0))}
          loading={statsLoading}
        />
        {(quickStats?.ordersByStatus ?? []).slice(0, 2).map((s, i) => (
          <StatCard
            key={s.status}
            title={s.status}
            value={toArabicDigits(s.count)}
            subtitle={ui('أمر')}
            colorIndex={i + 2}
          />
        ))}
      </div>

      <FilterBar fields={filters} searchPlaceholder={ui('بحث في أوامر الشراء…')} />
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
            <DialogTitle>{ui('أمر شراء جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('المورد')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">{ui('—')}</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{ui('الفرع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
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
                <Label>{ui('شروط الدفع')}</Label>
                <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('تاريخ التسليم')}</Label>
                <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{ui('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <select
                    className="col-span-1 rounded-md border bg-background px-2 py-2 text-sm"
                    value={line.productId}
                    onChange={(e) => {
                      const p = products?.find((x) => x.id === Number(e.target.value));
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          productId: e.target.value,
                          name: p?.nameAr ?? '',
                          price: String(p?.costPrice ?? 0),
                        };
                        return next;
                      });
                    }}
                  >
                    <option value="">{ui('منتج')}</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    className="nums"
                    placeholder={ui('كمية')}
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
                    placeholder={ui('سعر')}
                    value={line.price}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], price: e.target.value };
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
                onClick={() => setLines((prev) => [...prev, { productId: '', name: '', quantity: '1', price: '0' }])}
              >
                {ui('إضافة بند')}
              </Button>
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
    </GymSalesPageShell>
  );
}
