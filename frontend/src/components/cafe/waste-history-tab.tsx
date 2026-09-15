import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, RotateCcw, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Paginated, WasteRecord } from '@/pages/cafe/waste-types';

const money = (value: number) => `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;
const dateTime = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function WasteHistoryTab({ branchId }: { branchId: number }) {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [reversing, setReversing] = useState<WasteRecord | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const query = useQuery({
    queryKey: ['cafe-waste', 'records', branchId, search, status, dateFrom, dateTo, page, pageSize],
    queryFn: async () => (await api.get<Paginated<WasteRecord>>('/cafe-waste/records', { params: {
      page, pageSize, branchId, search: search.trim() || undefined, status, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    } })).data,
    enabled: branchId > 0,
  });
  const reverseMutation = useMutation({
    mutationFn: async () => api.post(`/cafe-waste/records/${reversing?.id}/reverse`, { reason: reversalReason.trim() }),
    onSuccess: async () => {
      toast.success(ui('تم عكس الحركة وإرجاع المخزون'));
      setReversing(null); setReversalReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cafe-waste'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ]);
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_160px]">
        <div className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={ui('بحث بالصنف أو السبب أو المرجع')} /></div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">{ui('كل الحالات')}</option><option value="active">{ui('نشط')}</option><option value="reversed">{ui('معكوس')}</option></select>
        <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} aria-label={ui('من تاريخ')} />
        <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} aria-label={ui('إلى تاريخ')} />
      </CardContent></Card>

      {query.isLoading && <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{ui('جاري تحميل سجل الهالك…')}</CardContent></Card>}
      {query.isError && <Card><CardContent className="py-12 text-center text-destructive">{apiError(query.error)}</CardContent></Card>}
      {!query.isLoading && !query.data?.data.length && <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{ui('لا توجد حركات هالك مطابقة')}</CardContent></Card>}
      <div className="space-y-3">
        {(query.data?.data ?? []).map((record) => (
          <Card key={record.id} className={record.status === 'reversed' ? 'opacity-75' : ''}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-base font-bold">{record.sourceName}</p><Badge variant={record.status === 'active' ? 'default' : 'secondary'}>{record.status === 'active' ? ui('نشط') : ui('تم العكس')}</Badge>{record.allowNegative && <Badge variant="destructive">{ui('سُمح بعجز')}</Badge>}</div><p className="nums mt-1 text-xs text-muted-foreground">{record.reference} · {dateTime(record.createdAt)}</p></div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 lg:min-w-[500px]">
                  <div><p className="text-xs text-muted-foreground">{ui('الكمية')}</p><p className="nums font-bold">{toArabicDigits(record.quantity)} {record.packageLabel ?? record.unit}</p></div>
                  <div><p className="text-xs text-muted-foreground">{ui('السبب')}</p><p className="truncate font-medium">{record.reasonName}</p></div>
                  <div><p className="text-xs text-muted-foreground">{ui('التكلفة')}</p><p className="nums font-bold text-rose-600">{money(record.totalCost)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{ui('سجله')}</p><p className="flex items-center gap-1 truncate"><UserRound className="size-3" />{record.createdByName}</p></div>
                </div>
                {record.status === 'active' && <Button permissionAction="create" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setReversing(record); setReversalReason(''); }}><RotateCcw className="size-4" />{ui('عكس الحركة')}</Button>}
              </div>
              {(record.notes || record.status === 'reversed') && <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm"><p>{record.notes || '—'}</p>{record.status === 'reversed' && <p className="mt-2 flex items-center gap-1 text-destructive"><Ban className="size-3" />{ui('سبب العكس')}: {record.reversalReason} · {record.reversedByName}</p>}</div>}
              <details className="group mt-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary"><ChevronDown className="size-4 transition-transform group-open:rotate-180" />{ui('تفاصيل المكونات المخصومة')}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{record.components.map((component, index) => <div key={`${component.productId}-${index}`} className="flex justify-between gap-3 rounded-lg border bg-muted/20 p-2 text-sm"><span>{component.name}</span><span className="nums font-semibold">{toArabicDigits(component.quantity)} {component.unit} · {money(component.cost)}</span></div>)}</div></details>
            </CardContent>
          </Card>
        ))}
      </div>

      {!!query.data && query.data.total > 0 && <Pagination
        page={page}
        pageSize={pageSize}
        total={query.data.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />}

      <Dialog open={!!reversing} onOpenChange={(next) => { if (!next) setReversing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{ui('عكس حركة الهالك')}</DialogTitle><DialogDescription>{ui('سيتم إرجاع كل المكونات للمخزون وعكس التكلفة المحاسبية، مع الاحتفاظ بالحركة في السجل.')}</DialogDescription></DialogHeader>
          <div className="space-y-2"><p className="font-bold">{reversing?.sourceName}</p><Textarea autoFocus rows={4} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder={ui('اكتب سبب عكس الحركة')} /></div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setReversing(null)}>{ui('إلغاء')}</Button><Button permissionAction="create" variant="destructive" disabled={reversalReason.trim().length < 3 || reverseMutation.isPending} onClick={() => reverseMutation.mutate()}><RotateCcw className="size-4" />{ui('تأكيد العكس')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
