import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarDays, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/common/stat-card';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { cafeUnitLabel } from '@/lib/cafe-units';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface DailyStockRow {
  productId: number;
  productCode: string;
  productName: string;
  productSize?: string | null;
  inventoryKind: 'raw_material' | 'ready_product';
  unit: string;
  openingStock: number;
  incomingToday: number;
  outgoingToday: number;
  soldToday: number;
  closingStock: number;
  currentStock: number;
  stockValue: number;
  movementCount: number;
}

interface DailyStockResponse {
  date: string;
  rows: DailyStockRow[];
  summary: {
    byUnit: Array<{ unit: string; opening: number; incoming: number; outgoing: number; closing: number; current: number }>;
    movementCount: number;
    stockValue: number;
  };
}

export function DailyStockOverview() {
  const { ui } = useLocale();
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('all');
  const [date, setDate] = useState(localToday());
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-dashboard', 'daily-stock', branchId, date, search, kind],
    queryFn: async () => {
      const { data } = await api.get<DailyStockResponse>('/inventory-dashboard/daily-stock', {
        params: {
          branchId: branchId === 'all' ? undefined : branchId,
          date,
          search: search || undefined,
          inventoryKind: kind,
        },
      });
      return data;
    },
  });
  const rows = data?.rows ?? [];
  const lowCount = useMemo(() => rows.filter((row) => row.currentStock <= 0).length, [rows]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="text-lg">{ui('متابعة مخزون اليوم')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{ui('رصيد بداية اليوم، ما دخل وخرج اليوم، ورصيد الإغلاق والحالي لكل خامة ومنتج جاهز')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <select className="rounded-lg border bg-background px-3 py-2" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="all">{ui('كل الفروع')}</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select className="rounded-lg border bg-background px-3 py-2" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">{ui('الخامات والمنتجات الجاهزة')}</option>
            <option value="raw_material">{ui('الخامات')}</option>
            <option value="ready_product">{ui('المنتجات الجاهزة')}</option>
          </select>
          <div className="relative">
            <CalendarDays className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={ui('بحث...')} value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard title={ui('عدد حركات اليوم')} value={toArabicDigits(data?.summary.movementCount ?? 0)} icon={<ArrowDownToLine className="size-5" />} colorIndex={1} />
          <StatCard title={ui('قيمة المخزون الحالي')} value={toArabicDigits(Math.round(data?.summary.stockValue ?? 0))} icon={<Boxes className="size-5" />} colorIndex={3} />
          <StatCard title={ui('أصناف نفدت')} value={toArabicDigits(lowCount)} icon={<ArrowUpFromLine className="size-5" />} colorIndex={4} />
        </div>
        {!!data?.summary.byUnit.length && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/60 text-muted-foreground"><tr>
                <th className="p-3 text-start">{ui('الوحدة')}</th><th className="p-3 text-center">{ui('بداية اليوم')}</th><th className="p-3 text-center">{ui('الوارد')}</th><th className="p-3 text-center">{ui('المنصرف')}</th><th className="p-3 text-center">{ui('إغلاق اليوم')}</th><th className="p-3 text-center">{ui('الموجود الآن')}</th>
              </tr></thead>
              <tbody>{data.summary.byUnit.map((row) => <tr key={row.unit} className="border-t">
                <td className="p-3 font-medium">{cafeUnitLabel(row.unit)}</td><td className="nums p-3 text-center">{toArabicDigits(row.opening)}</td><td className="nums p-3 text-center text-emerald-700">+{toArabicDigits(row.incoming)}</td><td className="nums p-3 text-center text-rose-700">-{toArabicDigits(row.outgoing)}</td><td className="nums p-3 text-center">{toArabicDigits(row.closing)}</td><td className="nums p-3 text-center font-bold">{toArabicDigits(row.current)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{ui('الصنف')}</th>
                <th className="p-3 text-center">{ui('النوع')}</th>
                <th className="p-3 text-center">{ui('بداية اليوم')}</th>
                <th className="p-3 text-center">{ui('الوارد')}</th>
                <th className="p-3 text-center">{ui('المنصرف')}</th>
                <th className="p-3 text-center">{ui('مبيعات/استهلاك')}</th>
                <th className="p-3 text-center">{ui('إغلاق اليوم')}</th>
                <th className="p-3 text-center">{ui('الموجود الآن')}</th>
                <th className="p-3 text-center">{ui('الحركات')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId} className="border-t hover:bg-muted/25">
                  <td className="p-3"><span className="block font-medium">{row.productName}{row.productSize ? ` — ${row.productSize}` : ''}</span><span className="text-xs text-muted-foreground">{row.productCode} · {row.unit}</span></td>
                  <td className="p-3 text-center">{row.inventoryKind === 'raw_material' ? ui('خامة') : ui('منتج جاهز')}</td>
                  <td className="nums p-3 text-center">{toArabicDigits(row.openingStock)}</td>
                  <td className="nums p-3 text-center text-emerald-700">+{toArabicDigits(row.incomingToday)}</td>
                  <td className="nums p-3 text-center text-rose-700">-{toArabicDigits(row.outgoingToday)}</td>
                  <td className="nums p-3 text-center">{toArabicDigits(row.soldToday)}</td>
                  <td className="nums p-3 text-center font-semibold">{toArabicDigits(row.closingStock)}</td>
                  <td className={`nums p-3 text-center font-bold ${row.currentStock <= 0 ? 'text-destructive' : 'text-primary'}`}>{toArabicDigits(row.currentStock)}</td>
                  <td className="nums p-3 text-center">{toArabicDigits(row.movementCount)}</td>
                </tr>
              ))}
              {!isLoading && !rows.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{ui('لا توجد حركة مخزون في هذه النتائج')}</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
