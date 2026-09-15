import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Boxes,
  Coffee,
  PackageOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { WasteRegistrationSheet } from '@/components/cafe/waste-registration-sheet';
import type {
  Paginated,
  WasteCatalogItem,
  WasteCatalogKind,
  WasteReason,
  WasteRecord,
} from '@/pages/cafe/waste-types';

const kindFilters: Array<{ value: WasteCatalogKind; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'raw_material', label: 'الخامات' },
  { value: 'ready_product', label: 'المنتجات الجاهزة' },
  { value: 'prepared_product', label: 'المنتجات المُحضّرة' },
  { value: 'packaging', label: 'مواد التغليف' },
];

const kindLabels: Record<Exclude<WasteCatalogKind, 'all'>, string> = {
  raw_material: 'خامة',
  ready_product: 'منتج جاهز',
  prepared_product: 'منتج مُحضّر',
  packaging: 'تغليف',
};

type PanelMode = 'list' | 'catalog' | 'form';

interface ShiftWastePanelProps {
  branchId: number;
  shiftSessionId: number;
  records: WasteRecord[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  canCreate: boolean;
  onReturnToHandover: () => void;
  onRetry: () => void;
}

export function ShiftWastePanel({
  branchId,
  shiftSessionId,
  records,
  isLoading,
  isError,
  error,
  canCreate,
  onReturnToHandover,
  onRetry,
}: ShiftWastePanelProps) {
  const { ui } = useLocale();
  const [mode, setMode] = useState<PanelMode>('list');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kind, setKind] = useState<WasteCatalogKind>('all');
  const [selected, setSelected] = useState<WasteCatalogItem | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const catalogQuery = useQuery({
    queryKey: ['cafe-waste', 'catalog', branchId, debouncedSearch, kind],
    queryFn: async () => (await api.get<Paginated<WasteCatalogItem>>('/cafe-waste/catalog', {
      params: {
        branchId,
        search: debouncedSearch || undefined,
        kind,
        page: 1,
        pageSize: 500,
      },
    })).data,
    enabled: mode === 'catalog' && branchId > 0,
  });

  const reasonsQuery = useQuery({
    queryKey: ['cafe-waste', 'reasons', 'active'],
    queryFn: async () => (await api.get<WasteReason[]>('/cafe-waste/reasons')).data,
    enabled: mode === 'form',
  });

  const choose = (item: WasteCatalogItem) => {
    if (!canCreate) return;
    setSelected(item);
    setMode('form');
  };

  if (mode === 'form' && selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-black">
              <Trash2 className="size-5 text-rose-500" />
              {ui('تسجيل هالك')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{selected.name} · <span className="nums">{selected.code}</span></p>
          </div>
          <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={() => setMode('catalog')}>
            <ArrowRight className="size-4" />{ui('العودة لاختيار صنف')}
          </Button>
        </div>
        {reasonsQuery.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        ) : reasonsQuery.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p>{apiError(reasonsQuery.error)}</p>
            <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={() => void reasonsQuery.refetch()}>{ui('إعادة المحاولة')}</Button>
          </div>
        ) : (
          <WasteRegistrationSheet
            key={`${selected.sourceKind}-${selected.sourceId}`}
            item={selected}
            branchId={branchId}
            shiftSessionId={shiftSessionId}
            open
            embedded
            onOpenChange={() => undefined}
            reasons={reasonsQuery.data ?? []}
            onSaved={() => {
              setSelected(null);
              setMode('list');
            }}
          />
        )}
      </div>
    );
  }

  if (mode === 'catalog') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-lg font-black">{ui('اختر صنف الهالك')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{ui('ابحث في نفس أصناف الهالك المتاحة للفرع الحالي.')}</p>
          </div>
          <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={() => setMode('list')}>
            <ArrowRight className="size-4" />{ui('هالك الشيفت')}
          </Button>
        </div>
        <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-12 rounded-xl ps-12 text-base"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui('ابحث باسم الخامة أو المنتج أو الكود أو الباركود…')}
              aria-label={ui('بحث في أصناف الهالك')}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2" aria-label={ui('تصنيف أصناف الهالك')}>
            {kindFilters.map((filter) => (
              <Button
                key={filter.value}
                permissionAction={null}
                type="button"
                size="sm"
                className="min-h-11"
                variant={kind === filter.value ? 'default' : 'outline'}
                onClick={() => setKind(filter.value)}
              >
                {ui(filter.label)}
              </Button>
            ))}
          </div>
        </div>

        {catalogQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
          </div>
        ) : catalogQuery.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p>{apiError(catalogQuery.error)}</p>
            <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={() => void catalogQuery.refetch()}>{ui('إعادة المحاولة')}</Button>
          </div>
        ) : !catalogQuery.data?.data.length ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <PackageOpen className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-medium">{ui('لا توجد أصناف مطابقة للبحث')}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogQuery.data.data.map((item) => (
              <button
                key={`${item.sourceKind}-${item.sourceId}`}
                type="button"
                onClick={() => choose(item)}
                className="group flex min-h-32 gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 to-rose-500/10">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : item.kind === 'prepared_product' ? <Coffee className="size-8 text-primary/50" /> : <Boxes className="size-8 text-primary/50" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate font-bold">{item.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{ui(kindLabels[item.kind])}</Badge>
                  </span>
                  <span className="nums mt-1 block text-xs text-muted-foreground">{item.code}</span>
                  <span className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{ui('الرصيد')}</span>
                    <b className="nums">{item.stock == null ? ui('حسب الوصفة') : `${toArabicDigits(item.stock)} ${item.unit}`}</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-black"><Trash2 className="size-5 text-rose-500" />{ui('هالك الشيفت')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui('العمليات المسجلة على الشيفت الحالي فقط. تسجيل الهالك اختياري قبل التسليم.')}</p>
        </div>
        {canCreate ? (
          <Button permissionAction={null} type="button" onClick={() => setMode('catalog')}>
            <Plus className="size-4" />{ui('إضافة هالك')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div>
      ) : isError ? (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{apiError(error)}</p>
          <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={onRetry}>{ui('إعادة المحاولة')}</Button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <Trash2 className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 font-bold">{ui('لم يُسجل هالك في هذا الشيفت')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui('يمكن إتمام التسليم مباشرة أو إضافة هالك عند الحاجة.')}</p>
          {canCreate ? <Button permissionAction={null} type="button" className="mt-4" onClick={() => setMode('catalog')}><Plus className="size-4" />{ui('تسجيل أول صنف')}</Button> : null}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{record.sourceName}</p>
                  {record.status === 'reversed' ? <Badge variant="outline">{ui('معكوس')}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{record.reasonName} · {record.createdByName}</p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                <b className="nums">{toArabicDigits(record.quantity)} {record.unit}</b>
                <span className="nums text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
        <Button permissionAction={null} type="button" variant="outline" className="min-h-11" onClick={onReturnToHandover}>
          <ArrowRight className="size-4" />{ui('العودة لتسليم الشيفت')}
        </Button>
        {canCreate && records.length > 0 ? <Button permissionAction={null} type="button" onClick={() => setMode('catalog')}><Plus className="size-4" />{ui('إضافة صنف آخر')}</Button> : null}
      </div>
    </div>
  );
}
