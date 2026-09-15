import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Boxes, ChefHat, CircleDollarSign, Clock3, Download, HandCoins, Lightbulb, ReceiptText, ShoppingBasket, Star, Trash2, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '@/pages/gym-sales/shell';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import type { InvoicePaymentSummary } from '@/types/gym-sales';
import { ErrorState } from '@/components/common/states';
import { buildCafeReportExportRows, cafeReportCsv } from './report-model';

interface ProductMetric { productId: number; name: string; quantity: number; revenue: number; cost: number; profit: number }
interface CafeReport {
  section?: 'summary' | 'protein' | 'bar' | 'management_withdrawals';
  sectionBreakdown?: { protein: { quantity: number; billed: number; collected: number; cost: number; profit: number }; bar: { quantity: number; billed: number; collected: number; cost: number; profit: number }; managementWithdrawals: Array<{ id: number; reference: string; date: string; status: string; amount: number; reason?: string | null; items: Array<{ name: string; quantity: number; cost: number }> }> };
  paymentSummary?: InvoicePaymentSummary;
  totalSales: number; totalOrders: number; averageOrderValue: number; netRevenue: number; previousRevenue: number; revenueGrowth: number; totalDiscounts: number; totalTaxes: number; totalRefunds: number; wasteCost: number; grossProfit: number;
  materialsCost: number; materialsCostPercentage: number; settledAccountsRevenue: number; uncollectedAccountsValue: number;
  products: { soldSummary: ProductMetric[]; soldTotals: { items: number; quantity: number; revenue: number; cost: number; profit: number; orders: number }; shifts: Array<{ sessionId: number; label: string }>; bestSelling: ProductMetric[]; worstSelling: ProductMetric[]; highestRevenue: ProductMetric[]; lowestRevenue: ProductMetric[]; neverSold: Array<{ productId: number; name: string; sellPrice: number }> };
  time: { byHour: Array<{ hour: number; label: string; orders: number; sales: number }>; byDay: Array<{ date: string; orders: number; sales: number }>; byWeek: Array<{ label: string; orders: number; sales: number }>; byMonth: Array<{ label: string; orders: number; sales: number }>; byWeekday: Array<{ day: number; name: string; orders: number; sales: number }>; rushHours: Array<{ label: string; sales: number }>; quietHours: Array<{ label: string; sales: number }> };
  customers: { averageBasketSize: number; returningCustomers: number; newCustomers: number; highestSpending: Array<{ name: string; phone: string | null; orders: number; spend: number }>; ratings: Array<{ rating: number; comment: string | null; date: string; invoiceId: number }>; averageRating: number };
  employees: Array<{ userId: number | null; name: string; orders: number; sales: number; discounts: number; refunds: number; averageInvoice: number }>;
  inventory: {
    lowStock: Array<{ productId: number; name: string; stock: number; reorderPoint: number }>;
    fastMoving: ProductMetric[];
    slowMoving: ProductMetric[];
    nearExpiration: Array<{ productId: number; name: string; expiryDate: string }>;
    waste: {
      totalCost: number;
      manualCost: number;
      automaticCost: number;
      transactionCount: number;
      topItems: Array<{ productId: number | null; name: string; quantity: number; cost: number; unit: string | null }>;
      recent: Array<{ id: number; reference: string; invoiceNumber: string; date: string; amount: number; reason: string | null }>;
    };
  };
  insights: string[];
}

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';
const iso = (date: Date) => format(date, 'yyyy-MM-dd');

function presetRange(preset: Preset) {
  const today = new Date();
  if (preset === 'today') return { from: iso(today), to: iso(today) };
  if (preset === 'yesterday') { const day = subDays(today, 1); return { from: iso(day), to: iso(day) }; }
  if (preset === 'week') return { from: iso(startOfWeek(today, { weekStartsOn: 6 })), to: iso(endOfWeek(today, { weekStartsOn: 6 })) };
  if (preset === 'year') return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) };
  return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
}

const money = (value: number) => `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;

export function CafeReportsPage() {
  const { ui } = useLocale();
  const [preset, setPreset] = useState<Preset>('month');
  const initialRange = presetRange('month');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  // Scopes only the sold-products summary, so the headline tiles keep their period meaning.
  const [soldShiftId, setSoldShiftId] = useState('');
  const [reportSection, setReportSection] = useState<'summary' | 'protein' | 'bar' | 'management_withdrawals'>('summary');
  // JWT audience contract: 0=male, 1=female; -1/null are unrestricted.
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');
  const lockedAudience = user?.man_women_type === 0 ? 'male' : user?.man_women_type === 1 ? 'female' : null;
  const effectiveGender = lockedAudience ?? gender;
  const genderLocked = lockedAudience !== null;
  const effectiveBranchId = branchId || (user?.branch && user.branch > 0 ? String(user.branch) : '') || String(branches[0]?.id ?? '');

  const selectPreset = (next: Preset) => {
    setPreset(next);
    if (next !== 'custom') { const range = presetRange(next); setFrom(range.from); setTo(range.to); }
  };
  const exportScopedCsv = () => {
    if (!data?.sectionBreakdown) return;
    const rows = buildCafeReportExportRows(reportSection, data.sectionBreakdown);
    const blob = new Blob([cafeReportCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `cafe-report-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cafe-reports', from, to, effectiveBranchId, soldShiftId, reportSection, effectiveGender],
    queryFn: async () => (await api.get<CafeReport>('/cafe-products/reports/summary', { params: { dateFrom: from, dateTo: to, branchId: effectiveBranchId || undefined, shiftSessionId: soldShiftId || undefined, section: reportSection === 'summary' ? undefined : reportSection, gender: effectiveGender === 'all' ? undefined : effectiveGender } })).data,
    enabled: !!effectiveBranchId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const kpis = [
    [ui('إجمالي المبيعات'), data?.totalSales ?? 0, CircleDollarSign, 'money'],
    [ui('إجمالي الطلبات'), data?.totalOrders ?? 0, ReceiptText, 'number'],
    [ui('متوسط قيمة الطلب'), data?.averageOrderValue ?? 0, ShoppingBasket, 'money'],
    [ui('صافي الإيراد'), data?.netRevenue ?? 0, TrendingUp, 'money'],
    [ui('تشغيل الخامات'), data?.materialsCost ?? 0, ChefHat, 'money'],
    [ui('حسابات لم تُحصّل'), data?.uncollectedAccountsValue ?? 0, HandCoins, 'money'],
    [ui('الخصومات'), data?.totalDiscounts ?? 0, ArrowDownRight, 'money'],
    [ui('الضرائب'), data?.totalTaxes ?? 0, BarChart3, 'money'],
    [ui('المبالغ المستردة'), data?.totalRefunds ?? 0, ArrowDownRight, 'money', 'negative'],
    [ui('الهالك والفاقد'), data?.wasteCost ?? 0, Trash2, 'money', 'negative'],
    [ui('الربح'), data?.grossProfit ?? 0, ArrowUpRight, 'money'],
  ] as const;

  const monthly = useMemo(() => {
    if (data?.time.byMonth) return data.time.byMonth;
    const map = new Map<string, { label: string; sales: number; orders: number }>();
    for (const row of data?.time.byDay ?? []) {
      const key = row.date.slice(0, 7);
      const current = map.get(key) ?? { label: key, sales: 0, orders: 0 };
      current.sales += row.sales; current.orders += row.orders; map.set(key, current);
    }
    return [...map.values()];
  }, [data]);

  if (isError && !data) {
    return <GymSalesPageShell section="sales" title={ui('تحليلات أعمال الكافيه')} description={ui('لوحة قرارات متكاملة للمبيعات والعملاء والموظفين والمخزون')}><ErrorState title={ui('تعذر تحميل تقرير الكافيه')} message={ui('راجع اتصالك ثم أعد المحاولة.')} onRetry={() => void refetch()} /></GymSalesPageShell>;
  }

  const productTable = (rows: ProductMetric[], mode: 'quantity' | 'revenue' = 'quantity') => (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد بيانات في هذه الفترة')}</p> : rows.map((row, index) => (
        <div key={row.productId} className="flex items-center gap-3 rounded-xl border bg-background p-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{toArabicDigits(index + 1)}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{ui('ربح')} {money(row.profit)}</p></div>
          <p className="nums font-semibold">{mode === 'revenue' ? money(row.revenue) : `${toArabicDigits(row.quantity)} ${ui('وحدة')}`}</p>
        </div>
      ))}
    </div>
  );

  return (
    <GymSalesPageShell section="sales" title={ui('تحليلات أعمال الكافيه')} description={ui('لوحة قرارات متكاملة للمبيعات والعملاء والموظفين والمخزون')}>
      <Card className="overflow-hidden border-0 bg-gradient-to-l from-primary/15 via-card to-card shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {([['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['year', 'هذا العام'], ['custom', 'فترة مخصصة']] as Array<[Preset, string]>).map(([value, label]) => (
              <Button key={value} size="sm" variant={preset === value ? 'default' : 'outline'} onClick={() => selectPreset(value)}>{ui(label)}</Button>
            ))}
          </div>
          {preset === 'custom' && <><Input className="w-40" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><Input className="w-40" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></>}
          <select className="h-9 min-w-40 rounded-md border bg-background px-3 text-sm" value={effectiveBranchId} onChange={(event) => setBranchId(event.target.value)} disabled={branches.length <= 1}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <select aria-label={ui('قسم الأعضاء')} className="h-9 min-w-32 rounded-md border bg-background px-3 text-sm" value={effectiveGender} onChange={(event) => setGender(event.target.value as typeof gender)} disabled={genderLocked}><option value="all">{ui('كل الأقسام')}</option><option value="male">{ui('رجال')}</option><option value="female">{ui('سيدات')}</option></select>
          <Badge variant="secondary" className="ms-auto">{toArabicDigits(from)} — {toArabicDigits(to)}</Badge>
          <Button type="button" variant="outline" size="sm" className="min-h-9" disabled={!data} onClick={exportScopedCsv}><Download className="size-4" />{ui('تصدير CSV')}</Button>
        </CardContent>
      </Card>
      {effectiveGender !== 'all' ? <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">{ui('يعرض هذا القسم مبيعات الأعضاء المرتبطة فقط. البيع النقدي أو الشريك أو الموظف دون عضو مرتبط لا يدخل في تقرير رجال/سيدات.')}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value, Icon, kind, tone]) => (
          <Card key={label} className="overflow-hidden border-border/60 shadow-sm">
            <CardContent className="relative p-5"><div className="absolute end-0 top-0 size-20 rounded-es-full bg-primary/5" /><Icon className={`mb-3 size-6 ${tone === 'negative' ? 'text-rose-500' : 'text-primary'}`} /><p className="text-sm text-muted-foreground">{label}</p><p className="nums mt-1 text-2xl font-bold">{isLoading ? '…' : kind === 'money' ? money(value) : toArabicDigits(value)}</p></CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={reportSection} onValueChange={(value) => setReportSection(value as typeof reportSection)} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-fit" aria-label={ui('أقسام تقرير الكافيه')}>
          <TabsTrigger className="min-h-11" value="summary">{ui('الملخص')}</TabsTrigger><TabsTrigger className="min-h-11" value="protein">Protein</TabsTrigger><TabsTrigger className="min-h-11" value="bar">Bar</TabsTrigger><TabsTrigger className="min-h-11" value="management_withdrawals">{ui('صرف الإدارة')}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" />
        {(['protein', 'bar'] as const).map((key) => <TabsContent key={key} value={key}><SectionReconciliation title={key === 'protein' ? 'Protein' : 'Bar'} row={data?.sectionBreakdown?.[key]} ui={ui} /></TabsContent>)}
        <TabsContent value="management_withdrawals"><Card><CardHeader><CardTitle>{ui('صرف الإدارة')}</CardTitle><p className="text-sm text-muted-foreground">{ui('حركات مصنفة على الخادم كصرف إدارة؛ لا تعتمد على اسم الصنف.')}</p></CardHeader><CardContent className="space-y-3">{!data?.sectionBreakdown?.managementWithdrawals.length ? <p className="py-6 text-center text-sm text-muted-foreground">{ui('لا توجد حركات في الفترة')}</p> : data.sectionBreakdown.managementWithdrawals.map((row) => <article key={row.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{row.reference}</p><p className="text-xs text-muted-foreground">{String(row.date).slice(0, 10)} · {row.status}</p></div><b className="nums">{money(row.amount)}</b></div><p className="mt-2 text-sm text-muted-foreground">{row.reason ?? ui('بدون سبب مسجل')}</p><ul className="mt-2 text-sm">{row.items.map((item, index) => <li key={index}>{item.name} — {toArabicDigits(item.quantity)} · {money(item.cost)}</li>)}</ul></article>)}</CardContent></Card></TabsContent>
      </Tabs>

      <Card className="overflow-hidden" aria-labelledby="payment-methods-title">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle id="payment-methods-title" className="flex items-center gap-2"><HandCoins className="size-5 text-primary" />{ui('المبيعات حسب طريقة الدفع')}</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">{ui('مدفوعات فواتير الفترة والفرع المختارين، بعد استبعاد الملغى والمسترد. الدفع المختلط موزّع على طرقه الفعلية.')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : !data?.paymentSummary ? <p className="p-6 text-sm text-muted-foreground">{ui('تعذر تحميل ملخص طرق الدفع')}</p> : <>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={ui('المبيعات حسب طريقة الدفع')}>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground"><tr>
                  <th scope="col" className="p-4 text-start">{ui('طريقة الدفع')}</th>
                  <th scope="col" className="p-4 text-end">{ui('المبلغ المحصل')}</th>
                  <th scope="col" className="p-4 text-end">{ui('النسبة من المحصل')}</th>
                </tr></thead>
                <tbody>
                  {data.paymentSummary.payments.map(payment => <tr key={payment.key} className="border-t">
                    <th scope="row" className="break-words p-4 text-start font-medium">{ui(payment.label)}</th>
                    <td className="nums whitespace-nowrap p-4 text-end font-semibold">{money(payment.amount)}</td>
                    <td className="nums p-4 text-end text-muted-foreground">{toArabicDigits((data.paymentSummary!.collected > 0 ? payment.amount / data.paymentSummary!.collected * 100 : 0).toFixed(1))}%</td>
                  </tr>)}
                  {data.paymentSummary.payments.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ui('لا توجد مدفوعات محصلة في هذه الفترة')}</td></tr>}
                </tbody>
                <tfoot className="border-t bg-primary/5 font-bold"><tr>
                  <th scope="row" className="p-4 text-start">{ui('إجمالي المحصل')}</th>
                  <td className="nums whitespace-nowrap p-4 text-end">{money(data.paymentSummary.collected)}</td>
                  <td className="nums p-4 text-end">{toArabicDigits(data.paymentSummary.collected > 0 ? 100 : 0)}%</td>
                </tr></tfoot>
              </table>
            </div>
            {data.paymentSummary.outstanding > 0 && <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t px-4 py-3 text-sm">
              <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">{ui('غير محصل')}</dt><dd className="nums font-semibold">{money(data.paymentSummary.outstanding)}</dd></div>
              <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">{ui('إجمالي الفواتير')}</dt><dd className="nums font-semibold">{money(data.paymentSummary.total)}</dd></div>
            </dl>}
          </>}
          <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">{ui('المبالغ تشمل الضريبة بعد الخصم. لا يشمل هذا القسم تحصيل كشوف الحساب اللاحق أو حركات الدرج.')}</p>
        </CardContent>
      </Card>

      {/* The tiles above are eleven independent numbers; without this the reader has to
          reconstruct how profit was reached and re-does the arithmetic by hand. */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <p className="mb-6 text-center text-base font-semibold text-muted-foreground sm:text-lg">{ui('كيف وصلنا للربح')}</p>
          {/* Each operator is glued to the term it applies to, so when the row wraps on a
              phone the sign leads its own line instead of dangling at the end of the previous one. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
            <ReconStep label={ui('إجمالي المبيعات')} value={money(data?.totalSales ?? 0)} />
            <ReconStep label={ui('الخصومات')} value={money(data?.totalDiscounts ?? 0)} tone="negative" op="−" />
            <ReconStep label={ui('حسابات لم تُحصّل')} value={money(data?.uncollectedAccountsValue ?? 0)} tone="negative" op="−" />
            {(data?.totalTaxes ?? 0) > 0
              ? <ReconStep label={ui('الضرائب')} value={money(data?.totalTaxes ?? 0)} tone="negative" op="−" />
              : null}
            <ReconStep label={ui('صافي الإيراد')} value={money(data?.netRevenue ?? 0)} tone="result" op="=" />
          </div>

          <div className="mx-auto my-6 max-w-3xl border-t border-dashed" />

          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
            <ReconStep label={ui('صافي الإيراد')} value={money(data?.netRevenue ?? 0)} />
            <ReconStep label={ui('تشغيل الخامات')} value={money(data?.materialsCost ?? 0)} tone="negative" op="−" />
            <ReconStep label={ui('الهالك والفاقد')} value={money(data?.wasteCost ?? 0)} tone="negative" op="−" />
            <ReconStep label={ui('الربح')} value={money(data?.grossProfit ?? 0)} tone="result" op="=" />
          </div>

          {/* Revenue collected in this period against orders billed in an earlier one. It has
              no matching row in the sales figures above, so without calling it out the first
              identity silently stops balancing. */}
          {(data?.settledAccountsRevenue ?? 0) > 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {ui('يشمل صافي الإيراد')}{' '}
              <span className="nums font-semibold text-foreground">{money(data?.settledAccountsRevenue ?? 0)}</span>{' '}
              {ui('تحصيل كشوف حساب موظفين وشركاء')}
            </p>
          ) : null}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {ui('تشغيل الخامات يمثل')}{' '}
            <span className="nums font-semibold text-foreground">{toArabicDigits((data?.materialsCostPercentage ?? 0).toFixed(1))}%</span>{' '}
            {ui('من صافي الإيراد')}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle>{ui('اتجاه المبيعات اليومي')}</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.time.byDay ?? []}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1E6BA8" stopOpacity={0.35}/><stop offset="95%" stopColor="#1E6BA8" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => money(Number(value))}/><Area type="monotone" dataKey="sales" stroke="#1E6BA8" strokeWidth={3} fill="url(#salesFill)" /></AreaChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10"><CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="size-5 text-amber-500" />{ui('رؤى قابلة للتنفيذ')}</CardTitle></CardHeader><CardContent className="space-y-3">{(data?.insights ?? []).map((insight, index) => <div key={index} className="rounded-xl border border-amber-200/70 bg-background/80 p-3 text-sm leading-6 dark:border-amber-900"><span className="me-2 font-bold text-amber-600">{toArabicDigits(index + 1)}.</span>{insight}</div>)}</CardContent></Card>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="h-auto flex-wrap"><TabsTrigger value="products"><Boxes className="me-2 size-4" />{ui('المنتجات')}</TabsTrigger><TabsTrigger value="time"><Clock3 className="me-2 size-4" />{ui('الوقت')}</TabsTrigger><TabsTrigger value="customers"><Users className="me-2 size-4" />{ui('العملاء')}</TabsTrigger><TabsTrigger value="employees"><Star className="me-2 size-4" />{ui('الموظفون')}</TabsTrigger><TabsTrigger value="inventory"><AlertTriangle className="me-2 size-4" />{ui('المخزون')}</TabsTrigger></TabsList>

        <TabsContent value="products"><div className="grid gap-4 lg:grid-cols-2"><SoldSummary rows={data?.products.soldSummary ?? []} totals={data?.products.soldTotals} shifts={data?.products.shifts ?? []} shiftId={soldShiftId} onShiftChange={setSoldShiftId} ui={ui} /><Card><CardHeader><CardTitle>{ui('الأكثر مبيعًا')}</CardTitle></CardHeader><CardContent>{productTable(data?.products.bestSelling ?? [])}</CardContent></Card><Card><CardHeader><CardTitle>{ui('الأقل مبيعًا')}</CardTitle></CardHeader><CardContent>{productTable(data?.products.worstSelling ?? [])}</CardContent></Card><Card><CardHeader><CardTitle>{ui('أعلى المنتجات إيرادًا')}</CardTitle></CardHeader><CardContent>{productTable(data?.products.highestRevenue ?? [], 'revenue')}</CardContent></Card><Card><CardHeader><CardTitle>{ui('أقل المنتجات إيرادًا')}</CardTitle></CardHeader><CardContent>{productTable(data?.products.lowestRevenue ?? [], 'revenue')}</CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle>{ui('منتجات لم تُبع في الفترة')}</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{(data?.products.neverSold ?? []).map((row) => <div key={row.productId} className="flex justify-between rounded-xl border p-3"><span>{row.name}</span><span className="nums text-muted-foreground">{money(row.sellPrice)}</span></div>)}{!(data?.products.neverSold ?? []).length ? <p className="py-6 text-center text-sm text-muted-foreground md:col-span-2">{ui('كل المنتجات النشطة حققت مبيعات في هذه الفترة')}</p> : null}</CardContent></Card></div></TabsContent>

        <TabsContent value="time"><div className="mb-4 grid gap-4 lg:grid-cols-2"><HourHighlights title={ui('ساعات الذروة')} rows={data?.time.rushHours ?? []} tone="rush" /><HourHighlights title={ui('الساعات الهادئة')} rows={data?.time.quietHours ?? []} tone="quiet" /></div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{ui('المبيعات حسب الساعة')}</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.time.byHour ?? []}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" interval={2} tick={{ fontSize: 10 }}/><YAxis/><Tooltip formatter={(value) => money(Number(value))}/><Bar dataKey="sales" fill="#1E6BA8" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle>{ui('المبيعات حسب يوم الأسبوع')}</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.time.byWeekday ?? []}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={(value) => money(Number(value))}/><Bar dataKey="sales" fill="#D4A72C" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle>{ui('المبيعات حسب الأسبوع')}</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.time.byWeek ?? []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip formatter={(value) => money(Number(value))}/><Area dataKey="sales" stroke="#7C3AED" fill="#7C3AED33" strokeWidth={3}/></AreaChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle>{ui('المبيعات حسب الشهر')}</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip formatter={(value) => money(Number(value))}/><Area dataKey="sales" stroke="#16856B" fill="#16856B33" strokeWidth={3}/></AreaChart></ResponsiveContainer></CardContent></Card></div></TabsContent>

        <TabsContent value="customers"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label={ui('متوسط حجم السلة')} value={toArabicDigits(data?.customers.averageBasketSize ?? 0)} /><Metric label={ui('عملاء عائدون')} value={toArabicDigits(data?.customers.returningCustomers ?? 0)} /><Metric label={ui('عملاء جدد')} value={toArabicDigits(data?.customers.newCustomers ?? 0)} /><Metric label={ui('متوسط التقييم')} value={`${toArabicDigits(data?.customers.averageRating ?? 0)} / 5`} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{ui('أعلى العملاء إنفاقًا')}</CardTitle></CardHeader><CardContent className="grid gap-2">{(data?.customers.highestSpending ?? []).map((row) => <div key={`${row.name}-${row.phone}`} className="flex justify-between rounded-xl border p-3"><div><p className="font-medium">{row.name}</p><p dir="ltr" className="text-xs text-muted-foreground">{row.phone || '—'}</p></div><div className="text-end"><p className="nums font-bold">{money(row.spend)}</p><p className="text-xs text-muted-foreground">{toArabicDigits(row.orders)} {ui('طلب')}</p></div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>{ui('آخر تقييمات العملاء')}</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.customers.ratings ?? []).slice(0, 10).map((row) => <div key={`${row.invoiceId}-${row.date}`} className="rounded-xl border p-3"><div className="flex justify-between"><span dir="ltr" className="text-amber-500">{'★'.repeat(row.rating)}{'☆'.repeat(5-row.rating)}</span><span className="text-xs text-muted-foreground">#{toArabicDigits(row.invoiceId)}</span></div>{row.comment ? <p className="mt-2 text-sm">{row.comment}</p> : null}</div>)}{!(data?.customers.ratings ?? []).length ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد تقييمات في الفترة')}</p> : null}</CardContent></Card></div></TabsContent>

        <TabsContent value="employees"><Card><CardHeader><CardTitle>{ui('أداء الكاشير')}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 text-start">{ui('الكاشير')}</th><th>{ui('المبيعات')}</th><th>{ui('الطلبات')}</th><th>{ui('متوسط الفاتورة')}</th><th>{ui('الخصومات')}</th><th>{ui('الاسترداد')}</th></tr></thead><tbody>{(data?.employees ?? []).map((row) => <tr key={row.userId ?? row.name} className="border-b last:border-0"><td className="p-3 font-medium">{row.name}</td><td className="nums text-center">{money(row.sales)}</td><td className="nums text-center">{toArabicDigits(row.orders)}</td><td className="nums text-center">{money(row.averageInvoice)}</td><td className="nums text-center">{money(row.discounts)}</td><td className="nums text-center">{toArabicDigits(row.refunds)}</td></tr>)}</tbody></table></CardContent></Card></TabsContent>

        <TabsContent value="inventory"><div className="grid gap-4 lg:grid-cols-2"><Card className="border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/10"><CardHeader><CardTitle className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Trash2 className="size-5 text-rose-500" />{ui('الهالك والفاقد')}</span><Badge variant="destructive">{money(data?.inventory.waste.totalCost ?? 0)}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">{ui('هالك يدوي')}</p><p className="nums mt-1 font-bold text-rose-600">{money(data?.inventory.waste.manualCost ?? 0)}</p></div><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">{ui('هالك تحضير تلقائي')}</p><p className="nums mt-1 font-bold text-amber-600">{money(data?.inventory.waste.automaticCost ?? 0)}</p></div></div>{(data?.inventory.waste.topItems ?? []).map((row) => <div key={`${row.productId ?? row.name}-${row.unit ?? ''}`} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"><div><p className="font-medium">{row.name}</p><p className="nums text-xs text-muted-foreground">{toArabicDigits(row.quantity)} {row.unit ?? ui('وحدة')}</p></div><p className="nums font-bold text-rose-600">{money(row.cost)}</p></div>)}{!(data?.inventory.waste.topItems ?? []).length ? <p className="py-6 text-center text-sm text-muted-foreground">{ui('لا يوجد هالك في هذه الفترة')}</p> : null}</CardContent></Card><Card><CardHeader><CardTitle>{ui('مخزون منخفض')}</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.inventory.lowStock ?? []).map((row) => <div key={row.productId} className="flex justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/10"><span>{row.name}</span><Badge variant="destructive">{toArabicDigits(row.stock)} / {toArabicDigits(row.reorderPoint)}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>{ui('قريب من انتهاء الصلاحية')}</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.inventory.nearExpiration ?? []).map((row) => <div key={row.productId} className="flex justify-between rounded-xl border p-3"><span>{row.name}</span><span className="nums text-amber-600">{toArabicDigits(String(row.expiryDate).slice(0,10))}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle>{ui('أصناف سريعة الحركة')}</CardTitle></CardHeader><CardContent>{productTable(data?.inventory.fastMoving ?? [])}</CardContent></Card><Card><CardHeader><CardTitle>{ui('أصناف بطيئة الحركة')}</CardTitle></CardHeader><CardContent>{productTable(data?.inventory.slowMoving ?? [])}</CardContent></Card></div></TabsContent>
      </Tabs>
    </GymSalesPageShell>
  );
}

function SectionReconciliation({ title, row, ui }: { title: string; row?: { quantity: number; billed: number; collected: number; cost: number; profit: number }; ui: (text: string) => string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{ui('التصنيف محفوظ مع سطر الفاتورة، والتحصيل موزع عليه ليتطابق مع إجمالي التحصيل الفعلي.')}</p></CardHeader><CardContent>{!row ? <p className="text-sm text-muted-foreground">{ui('جارٍ التحميل…')}</p> : <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[[ui('الكمية'), toArabicDigits(row.quantity)], [ui('قيمة الفواتير'), money(row.billed)], [ui('المحصل فعليًا'), money(row.collected)], [ui('التكلفة'), money(row.cost)], [ui('الربح'), money(row.profit)]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="nums mt-1 font-bold">{value}</dd></div>)}</dl>}</CardContent></Card>;
}

// The four top/bottom-10 lists answer "what sells best"; this answers "what did we
// actually sell", which is the list the owner reconciles against the shift-close receipt.
function SoldSummary({ rows, totals, shifts, shiftId, onShiftChange, ui }: {
  rows: ProductMetric[];
  totals?: { items: number; quantity: number; revenue: number; cost: number; profit: number; orders: number };
  shifts: Array<{ sessionId: number; label: string }>;
  shiftId: string;
  onShiftChange: (value: string) => void;
  ui: (text: string) => string;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>{ui('ملخص المنتجات المباعة')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {toArabicDigits(totals?.orders ?? 0)} {ui('أوردر')} · {toArabicDigits(totals?.items ?? 0)} {ui('صنف')} · {toArabicDigits(totals?.quantity ?? 0)} {ui('وحدة')}
            </Badge>
            {shifts.length ? (
              <select
                aria-label={ui('الوردية')}
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                value={shiftId}
                onChange={(event) => onShiftChange(event.target.value)}
              >
                <option value="">{ui('كل الورديات')}</option>
                {shifts.map((shift) => (
                  <option key={shift.sessionId} value={String(shift.sessionId)}>{shift.label}</option>
                ))}
              </select>
            ) : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* Two numbers on this page were both called "الربح" and the owner reasonably
            expected them to match. This table is accrual and per-item; the reconciliation
            strip is cash-based for the whole period. Naming them differently and stating
            the gap here is cheaper than answering the question every month. */}
        <p className="mb-4 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          {ui('ربح البيع هنا محسوب على ما تم بيعه بعد الخصم، ولا يخصم الهالك ولا يستثني الأوردرات التي لم تُحصّل بعد. أما «الربح» في شريط كيف وصلنا للربح فهو ربح الفترة فعليًا، والفرق بينهما = الهالك والفاقد + حسابات لم تُحصّل.')}
        </p>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد بيانات في هذه الفترة')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3 text-start">{ui('الصنف')}</th>
                <th className="p-3">{ui('الكمية')}</th>
                <th className="p-3">{ui('قيمة البيع')}</th>
                <th className="p-3">{ui('تكلفة الخامات')}</th>
                <th className="p-3">{ui('ربح البيع')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId} className="border-b last:border-0">
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="nums p-3 text-center">{toArabicDigits(row.quantity)}</td>
                  <td className="nums p-3 text-center">{money(row.revenue)}</td>
                  <td className="nums p-3 text-center text-rose-600">{money(row.cost)}</td>
                  <td className="nums p-3 text-center font-semibold text-emerald-600">{money(row.profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="p-3">{ui('الإجمالي')}</td>
                <td className="nums p-3 text-center">{toArabicDigits(totals?.quantity ?? 0)}</td>
                <td className="nums p-3 text-center">{money(totals?.revenue ?? 0)}</td>
                <td className="nums p-3 text-center text-rose-600">{money(totals?.cost ?? 0)}</td>
                <td className="nums p-3 text-center text-emerald-600">{money(totals?.profit ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function ReconStep({ label, value, tone, op }: { label: string; value: string; tone?: 'negative' | 'result'; op?: string }) {
  const valueTone = tone === 'negative' ? 'text-rose-600' : tone === 'result' ? 'text-emerald-600' : 'text-foreground';
  const box = tone === 'result'
    ? 'rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 px-6 py-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30'
    : 'px-2 py-1';
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      {op ? <span aria-hidden className="text-3xl font-light text-muted-foreground/70 sm:text-4xl">{op}</span> : null}
      <div className={`text-center ${box}`}>
        <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
        <p className={`nums mt-1 text-2xl font-bold sm:text-3xl ${valueTone}`}>{value}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="nums mt-2 text-2xl font-bold text-primary">{value}</p></CardContent></Card>;
}

function HourHighlights({ title, rows, tone }: { title: string; rows: Array<{ label: string; sales: number }>; tone: 'rush' | 'quiet' }) {
  return <Card className={tone === 'rush' ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10' : 'border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/10'}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{rows.map((row) => <div key={row.label} className="rounded-xl border bg-background px-4 py-2 text-center"><p className="nums font-bold">{toArabicDigits(row.label)}</p><p className="nums text-xs text-muted-foreground">{money(row.sales)}</p></div>)}</CardContent></Card>;
}
