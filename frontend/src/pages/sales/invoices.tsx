import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MessageSquareText, Printer, RotateCcw, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { confirmWithPreview } from '@/lib/confirm';
import { isDryRunResponse } from '@/lib/validators';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { QuickSaleRow, QuickSaleSummary } from '@/types/gym-sales';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { PosReceiptPrint, type PosReceiptData } from '@/components/sales/pos-receipt-print';
import { resolveCafePrintTemplates, type PosPrintTemplate } from '@/components/sales/pos-printing';

export function SalesInvoicesPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const { params, setParams } = useListQuery();
  const [selected, setSelected] = useState<QuickSaleRow | null>(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [receipt, setReceipt] = useState<PosReceiptData | null>(null);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<QuickSaleRow>(
    'quick-sales',
    params,
  );

  const { data: summary } = useQuery({
    queryKey: ['quick-sales', 'summary', params],
    queryFn: async () => {
      const { data: r } = await api.get<QuickSaleSummary>('/quick-sales/stats/summary', {
        params: {
          status: params.filters.status,
          paymentMethod: params.filters.paymentMethod,
          dateFrom: params.filters.dateFrom,
          dateTo: params.filters.dateTo,
        },
      });
      return r;
    },
  });
  const { data: printTemplateCatalog } = useQuery({
    queryKey: ['pos-invoice-templates', 'cafe-printing'],
    queryFn: async () => (await api.get<PaginatedResponse<PosPrintTemplate>>('/pos-invoice-templates', { params: { pageSize: 50, isActive: true } })).data.data ?? [],
  });
  const printTemplates = useMemo(() => resolveCafePrintTemplates(printTemplateCatalog ?? []), [printTemplateCatalog]);

  const statusOptions = useMemo(
    () => [
      { value: 'completed', label: ui('مكتمل') },
      { value: 'refunded', label: ui('مسترد') },
      { value: 'cancelled', label: ui('ملغي') },
    ],
    [ui],
  );

  const paymentOptions = useMemo(
    () => [
      { value: 'cash', label: ui('نقدي') },
      { value: 'card', label: ui('بطاقة') },
      { value: 'wallet', label: ui('محفظة') },
      { value: 'transfer', label: ui('تحويل') },
    ],
    [ui],
  );

  const filters: FilterField[] = [
    { key: 'status', label: ui('الحالة'), type: 'select', options: statusOptions },
    { key: 'paymentMethod', label: ui('الدفع'), type: 'select', options: paymentOptions },
    { key: 'dateFrom', label: ui('من تاريخ'), type: 'text', placeholder: 'YYYY-MM-DD' },
    { key: 'dateTo', label: ui('إلى تاريخ'), type: 'text', placeholder: 'YYYY-MM-DD' },
  ];

  const updateStatus = async (id: number, status: 'refunded' | 'cancelled') => {
    const label = status === 'refunded' ? ui('استرداد') : ui('إلغاء');
    await confirmWithPreview(
      {
        title: `${ui('تأكيد')} ${label}`,
        description: ui('الفاتورة؟'),
        variant: 'destructive',
        confirmLabel: label,
      },
      async () => {
        const { data } = await api.put(`/quick-sales/${id}?dryRun=true`, { status });
        if (!isDryRunResponse(data)) throw new Error(ui('تعذّر تحميل المعاينة'));
        return {
          rows: (data.rows ?? []) as { label: string; before?: string; after?: string }[],
          warning: data.warning,
        };
      },
      async () => {
        await api.put(`/quick-sales/${id}`, { status });
        toast.success(ui('تم تحديث الفاتورة'));
        void queryClient.invalidateQueries({ queryKey: ['quick-sales'] });
      },
    ).catch((e) => {
      if (e instanceof Error && e.message) toast.error(e.message);
      else toast.error(apiError(e));
    });
  };

  const printReceipt = async (id: number) => {
    try {
      await api.put(`/quick-sales/${id}/print`);
      const { data: sale } = await api.get<QuickSaleRow>(`/quick-sales/${id}`);
      setReceipt({
        saleNumber: sale.saleNumber,
        dailyNumber: sale.dailyNumber,
        saleDate: `${sale.saleDate} ${formatTime(sale.saleTime)}`.trim(),
        paymentMethod: sale.paymentMethod,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        receiptComment: sale.receiptComment ?? undefined,
        items: (sale.items ?? []).map((item) => ({
          name: item.name,
          variantName: item.variantName ?? undefined,
          itemNote: item.itemNote ?? undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openDetails = async (id: number) => {
    try {
      const { data: sale } = await api.get<QuickSaleRow>(`/quick-sales/${id}`);
      setSelected(sale);
      setRating(sale.feedback?.rating ?? 0);
      setFeedback(sale.feedback?.comment ?? '');
    } catch (error) { toast.error(apiError(error)); }
  };

  const saveFeedback = async () => {
    if (!selected || rating < 1) return toast.error(ui('اختر تقييمًا من نجمة إلى خمس نجوم'));
    setSavingFeedback(true);
    try {
      const { data } = await api.put(`/quick-sales/${selected.id}/feedback`, { rating, comment: feedback.trim() || undefined });
      setSelected({ ...selected, feedback: data });
      await queryClient.invalidateQueries({ queryKey: ['quick-sales'] });
      toast.success(ui('تم حفظ تقييم العميل'));
    } catch (error) { toast.error(apiError(error)); } finally { setSavingFeedback(false); }
  };

  const columns = useMemo<ColumnDef<QuickSaleRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<QuickSaleRow>,
      { accessorKey: 'saleNumber', header: ui('رقم الفاتورة') },
      { accessorKey: 'customerName', header: ui('العميل') },
      {
        accessorKey: 'totalAmount',
        header: ui('الإجمالي'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'paymentMethod',
        header: ui('الدفع'),
        cell: ({ getValue }) =>
          paymentOptions.find((o) => o.value === getValue())?.label ?? String(getValue() ?? '—'),
      },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ getValue }) => {
          const s = getValue() as string;
          const mapped = s === 'completed' ? 'active' : s === 'refunded' ? 'unset' : 'suspended';
          return <StatusBadge status={mapped} />;
        },
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button aria-label={ui('تفاصيل الفاتورة')} variant="ghost" size="icon" onClick={() => void openDetails(row.original.id)}><Eye className="h-4 w-4" /></Button>
            <Button aria-label={ui('طباعة')} variant="ghost" size="icon" onClick={() => void printReceipt(row.original.id)}>
              <Printer className="h-4 w-4" />
            </Button>
            {row.original.status === 'completed' && (
              <>
                <Button variant="ghost" size="icon" onClick={() => void updateStatus(row.original.id, 'refunded')}>
                  <RotateCcw className="h-4 w-4 text-warning" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void updateStatus(row.original.id, 'cancelled')}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [params.page, params.pageSize, paymentOptions, ui],
  );

  return (
    <GymSalesPageShell section="sales" title={ui('قائمة الفواتير')} description={ui('عرض وإدارة فواتير البيع')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{ui('عدد الفواتير')}</p>
            <p className="nums text-2xl font-bold">{toArabicDigits(summary?.totalSales ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{ui('إجمالي الإيراد')}</p>
            <p className="nums text-2xl font-bold text-primary">
              {toArabicDigits((summary?.totalRevenue ?? 0).toFixed(2))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{ui('مكتمل')}</p>
            <p className="nums text-2xl font-bold">
              {toArabicDigits(summary?.completedSales ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <FilterBar fields={filters} searchPlaceholder={ui('بحث في الفواتير…')} />
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
      <Dialog open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle className="flex items-center justify-between gap-3"><span>{ui('تفاصيل الفاتورة')} <span className="nums text-primary">{selected?.saleNumber}</span></span><StatusBadge status={selected?.status === 'completed' ? 'active' : selected?.status === 'refunded' ? 'unset' : 'suspended'} /></DialogTitle></DialogHeader>
          {selected && <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3">
              <div className="rounded-xl border"><div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 p-3 text-xs text-muted-foreground"><span>{ui('المنتج')}</span><span>{ui('الكمية')}</span><span>{ui('الإجمالي')}</span></div>{(selected.items ?? []).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b p-3 text-sm last:border-0"><span>{item.name}{item.variantName ? <small className="mt-0.5 block font-semibold text-primary">{item.variantName}</small> : null}{item.itemNote ? <small className="mt-1 block text-muted-foreground">{ui('ملاحظة')}: {item.itemNote}</small> : null}</span><span className="nums">{toArabicDigits(item.quantity)}</span><span className="nums">{toArabicDigits(item.lineTotal.toFixed(2))}</span></div>)}</div>
              {selected.receiptComment && <div className="rounded-xl border bg-primary/5 p-3"><p className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary"><MessageSquareText className="size-4" />{ui('تعليق الإيصال')}</p><p className="whitespace-pre-wrap text-sm">{selected.receiptComment}</p></div>}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-4 text-sm"><span>{ui('المجموع')}</span><span className="nums text-end">{toArabicDigits(selected.subtotal.toFixed(2))}</span><span>{ui('الخصم')}</span><span className="nums text-end">-{toArabicDigits(selected.discountAmount.toFixed(2))}</span><span>{ui('الضريبة')}</span><span className="nums text-end">{toArabicDigits(selected.taxAmount.toFixed(2))}</span><span className="font-bold">{ui('الإجمالي')}</span><span className="nums text-end text-lg font-bold text-primary">{toArabicDigits(selected.totalAmount.toFixed(2))} ج.م</span></div>
            </div>
            <div className="space-y-4 rounded-2xl border bg-card p-4">
              <div><p className="text-sm font-semibold">{ui('تقييم العميل')}</p><p className="text-xs text-muted-foreground">{ui('من نجمة واحدة إلى خمس نجوم')}</p></div>
              <div dir="ltr" className="flex justify-center gap-1">{[1,2,3,4,5].map((value) => <button key={value} type="button" disabled={selected.status !== 'completed'} onClick={() => setRating(value)} className="rounded p-1 transition hover:scale-110 disabled:cursor-not-allowed"><Star className={`size-8 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} /></button>)}</div>
              <Textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} disabled={selected.status !== 'completed'} placeholder={ui('اكتب تعليق العميل…')} className="min-h-28" />
              {selected.feedback?.date && <p className="nums text-xs text-muted-foreground">{ui('آخر تحديث')}: {toArabicDigits(String(selected.feedback.date).slice(0, 10))}</p>}
              <Button className="w-full" disabled={selected.status !== 'completed' || savingFeedback || rating < 1} onClick={() => void saveFeedback()}>{savingFeedback ? ui('جاري الحفظ…') : ui('حفظ التقييم')}</Button>
            </div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>{ui('إغلاق')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PosReceiptPrint open={receipt != null} onOpenChange={(open) => { if (!open) setReceipt(null); }} receipt={receipt} templates={printTemplates} />
    </GymSalesPageShell>
  );
}
