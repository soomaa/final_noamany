import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, ClipboardList, Coffee, PackageOpen, Search, Settings2, Trash2 } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WasteRegistrationSheet } from '@/components/cafe/waste-registration-sheet';
import { WasteReasonsTab } from '@/components/cafe/waste-reasons-tab';
import { WasteHistoryTab } from '@/components/cafe/waste-history-tab';
import { WasteAnalyticsTab } from '@/components/cafe/waste-analytics-tab';
import type { Paginated, WasteCatalogItem, WasteCatalogKind, WasteReason } from './waste-types';

const kindFilters: Array<{ value: WasteCatalogKind; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'raw_material', label: 'الخامات' },
  { value: 'ready_product', label: 'المنتجات الجاهزة' },
  { value: 'prepared_product', label: 'المنتجات المُحضّرة' },
  { value: 'packaging', label: 'مواد التغليف' },
];

const kindLabels: Record<Exclude<WasteCatalogKind, 'all'>, string> = {
  raw_material: 'خامة', ready_product: 'منتج جاهز', prepared_product: 'منتج مُحضّر', packaging: 'تغليف',
};

export function CafeWastePage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const { can } = usePermission();
  const [branchValue, setBranchValue] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kind, setKind] = useState<WasteCatalogKind>('all');
  const [selected, setSelected] = useState<WasteCatalogItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const effectiveBranchId = Number(branchValue || (user?.branch && user.branch > 0 ? user.branch : '') || branches[0]?.id || 0);
  const canCreate = can('club.cafe.waste:create');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const catalogQuery = useQuery({
    queryKey: ['cafe-waste', 'catalog', effectiveBranchId, debouncedSearch, kind],
    queryFn: async () => (await api.get<Paginated<WasteCatalogItem>>('/cafe-waste/catalog', { params: {
      branchId: effectiveBranchId, search: debouncedSearch || undefined, kind, page: 1, pageSize: 500,
    } })).data,
    enabled: effectiveBranchId > 0,
  });
  const reasonsQuery = useQuery({
    queryKey: ['cafe-waste', 'reasons', 'active'],
    queryFn: async () => (await api.get<WasteReason[]>('/cafe-waste/reasons')).data,
  });

  const choose = (item: WasteCatalogItem) => {
    if (!canCreate) return;
    setSelected(item);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ui('إدارة الكافيه والمخزون')}
        title={ui('الهالك والفاقد')}
        description={ui('تسجيل الهالك فورًا مع خصم المخزون وتحليل الأسباب والتكلفة')}
        actions={<select className="h-10 min-w-44 rounded-md border bg-background px-3 text-sm" value={String(effectiveBranchId || '')} onChange={(event) => setBranchValue(event.target.value)} disabled={branches.length <= 1}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
      />

      <Tabs defaultValue="register" dir="rtl">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
          <TabsTrigger value="register" className="gap-2"><Trash2 className="size-4" />{ui('تسجيل هالك')}</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><ClipboardList className="size-4" />{ui('السجل')}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2"><BarChart3 className="size-4" />{ui('التحليلات')}</TabsTrigger>
          <TabsTrigger value="reasons" className="gap-2"><Settings2 className="size-4" />{ui('أسباب الهالك')}</TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="space-y-5">
          <Card className="overflow-hidden border-0 bg-gradient-to-l from-rose-500/10 via-card to-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="relative"><Search className="absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-12 rounded-xl ps-12 text-base" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui('ابحث باسم الخامة أو المنتج أو الكود أو الباركود…')} autoFocus /></div>
              <div className="flex flex-wrap gap-2">{kindFilters.map((filter) => <Button key={filter.value} permissionAction={null} size="sm" variant={kind === filter.value ? 'default' : 'outline'} onClick={() => setKind(filter.value)}>{ui(filter.label)}</Button>)}</div>
            </CardContent>
          </Card>

          {!canCreate && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{ui('يمكنك عرض الأصناف، لكن تسجيل الهالك يحتاج صلاحية إضافة.')}</div>}
          {catalogQuery.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-48 rounded-2xl" />)}</div>}
          {catalogQuery.isError && <Card><CardContent className="space-y-3 py-16 text-center" role="alert"><p className="text-destructive">{apiError(catalogQuery.error)}</p><Button permissionAction={null} type="button" variant="outline" onClick={() => void catalogQuery.refetch()}>{ui('إعادة المحاولة')}</Button></CardContent></Card>}
          {!catalogQuery.isLoading && !catalogQuery.isError && !catalogQuery.data?.data.length && <Card><CardContent className="py-16 text-center"><PackageOpen className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-medium">{ui('لا توجد أصناف مطابقة للبحث')}</p></CardContent></Card>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {(catalogQuery.data?.data ?? []).map((item) => (
              <button key={`${item.sourceKind}-${item.sourceId}`} type="button" disabled={!canCreate} onClick={() => choose(item)} className="group overflow-hidden rounded-2xl border bg-card text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:cursor-default disabled:opacity-70">
                <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/5 to-rose-500/10">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover transition group-hover:scale-105" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : item.kind === 'prepared_product' ? <Coffee className="size-12 text-primary/50" /> : <Boxes className="size-12 text-primary/50" />}
                  <Badge variant="secondary" className="absolute end-3 top-3">{ui(kindLabels[item.kind])}</Badge>
                </div>
                <div className="space-y-3 p-4">
                  <div><p className="truncate text-base font-bold">{item.name}</p><p className="nums mt-1 text-xs text-muted-foreground">{item.code}</p></div>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{ui('الرصيد')}</span><span className={`nums font-bold ${item.stock != null && item.stock <= 0 ? 'text-destructive' : ''}`}>{item.stock == null ? ui('حسب الوصفة') : `${toArabicDigits(item.stock)} ${item.unit}`}</span></div>
                  {item.variants.length > 0 && <p className="text-xs text-muted-foreground">{toArabicDigits(item.variants.length)} {ui('أحجام أو أنواع متاحة')}</p>}
                </div>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history"><WasteHistoryTab branchId={effectiveBranchId} /></TabsContent>
        <TabsContent value="analytics"><WasteAnalyticsTab branchId={effectiveBranchId} /></TabsContent>
        <TabsContent value="reasons"><WasteReasonsTab /></TabsContent>
      </Tabs>

      <WasteRegistrationSheet item={selected} branchId={effectiveBranchId} open={sheetOpen} onOpenChange={setSheetOpen} reasons={reasonsQuery.data ?? []} />
    </div>
  );
}
