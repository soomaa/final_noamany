import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Boxes, CircleDollarSign, ClipboardList, TrendingDown, Users } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WasteAnalytics, WasteAnalyticsRow } from '@/pages/cafe/waste-types';

const iso = (date: Date) => format(date, 'yyyy-MM-dd');
const money = (value: number) => `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;

function Ranking({ title, rows, icon: Icon }: { title: string; rows: WasteAnalyticsRow[]; icon: typeof Boxes }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-primary" />{title}</CardTitle></CardHeader><CardContent className="space-y-2">{rows.slice(0, 8).map((row, index) => <div key={String(row.key)} className="flex items-center gap-3 rounded-xl border p-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{toArabicDigits(index + 1)}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{row.label}</p><p className="text-xs text-muted-foreground">{toArabicDigits(row.count)} حركة</p></div><p className="nums font-bold text-rose-600">{money(row.cost)}</p></div>)}{!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات</p>}</CardContent></Card>;
}

export function WasteAnalyticsTab({ branchId }: { branchId: number }) {
  const { ui } = useLocale();
  const [dateFrom, setDateFrom] = useState(iso(startOfMonth(new Date())));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const query = useQuery({
    queryKey: ['cafe-waste', 'analytics', branchId, dateFrom, dateTo],
    queryFn: async () => (await api.get<WasteAnalytics>('/cafe-waste/analytics', { params: { branchId, dateFrom, dateTo } })).data,
    enabled: branchId > 0,
  });
  const data = query.data;
  if (query.isError) return <Card><CardContent className="py-16 text-center text-destructive">{apiError(query.error)}</CardContent></Card>;
  return (
    <div className="space-y-5">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4"><div className="space-y-1"><p className="text-xs text-muted-foreground">{ui('من تاريخ')}</p><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="space-y-1"><p className="text-xs text-muted-foreground">{ui('إلى تاريخ')}</p><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/10"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{ui('إجمالي تكلفة الهالك')}</p><p className="nums mt-2 text-2xl font-black text-rose-600">{money(data?.totalCost ?? 0)}</p></div><CircleDollarSign className="size-9 text-rose-500" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{ui('عدد حركات الهالك')}</p><p className="nums mt-2 text-2xl font-black">{toArabicDigits(data?.recordCount ?? 0)}</p></div><ClipboardList className="size-9 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{ui('متوسط تكلفة الحركة')}</p><p className="nums mt-2 text-2xl font-black">{money(data?.averageCost ?? 0)}</p></div><TrendingDown className="size-9 text-amber-500" /></CardContent></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>{ui('اتجاه تكلفة الهالك')}</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.byDay ?? []}><defs><linearGradient id="wasteFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e11d48" stopOpacity={0.35}/><stop offset="95%" stopColor="#e11d48" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => money(Number(value))}/><Area type="monotone" dataKey="cost" stroke="#e11d48" strokeWidth={3} fill="url(#wasteFill)" /></AreaChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>{ui('تكلفة الهالك حسب السبب')}</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={(data?.byReason ?? []).slice(0, 8)} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{ fontSize: 10 }}/><YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => money(Number(value))}/><Bar dataKey="cost" fill="#e11d48" radius={[0,6,6,0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3"><Ranking title={ui('أكثر الأسباب تكلفة')} rows={data?.byReason ?? []} icon={TrendingDown} /><Ranking title={ui('أكثر الأصناف هالكًا')} rows={data?.byItem ?? []} icon={Boxes} /><Ranking title={ui('الهالك حسب المستخدم')} rows={data?.byUser ?? []} icon={Users} /></div>
      <Card><CardHeader><CardTitle>{ui('أعلى المكونات المخصومة')}</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(data?.topComponents ?? []).map((row) => <div key={row.productId} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{row.name}</p><p className="nums text-xs text-muted-foreground">{toArabicDigits(row.quantity)} {row.unit}</p></div><p className="nums font-bold text-rose-600">{money(row.cost)}</p></div>)}{!data?.topComponents.length && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">{ui('لا توجد بيانات في هذه الفترة')}</p>}</CardContent></Card>
    </div>
  );
}
