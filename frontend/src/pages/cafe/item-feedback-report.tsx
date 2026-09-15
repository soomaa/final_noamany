import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, MessageSquareText, PackageCheck, Sparkles, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '@/pages/gym-sales/shell';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';

interface FeedbackComment {
  comment: string;
  rating: number;
  date: string;
  invoiceId: number;
  dailyNumber: number;
}

interface ProductFeedback {
  productId: number;
  name: string;
  ratingsCount: number;
  averageRating: number;
  comments: FeedbackComment[];
}

interface ItemFeedbackReport {
  totalRatings: number;
  averageRating: number;
  distribution: Array<{ rating: number; count: number }>;
  products: ProductFeedback[];
  bestRated: ProductFeedback[];
  needsAttention: ProductFeedback[];
  recent: Array<{
    id: number;
    invoiceId: number;
    dailyNumber: number;
    saleDate: string;
    itemId: number;
    productId: number;
    productName: string;
    rating: number;
    comment: string | null;
    date: string;
  }>;
}

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const iso = (date: Date) => format(date, 'yyyy-MM-dd');

function presetRange(preset: Exclude<Preset, 'custom'>) {
  const today = new Date();
  if (preset === 'today') return { from: iso(today), to: iso(today) };
  if (preset === 'yesterday') {
    const day = subDays(today, 1);
    return { from: iso(day), to: iso(day) };
  }
  if (preset === 'week') {
    return {
      from: iso(startOfWeek(today, { weekStartsOn: 6 })),
      to: iso(endOfWeek(today, { weekStartsOn: 6 })),
    };
  }
  return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
}

export function CafeItemFeedbackReportPage() {
  const { ui } = useLocale();
  const initial = presetRange('month');
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [gender, setGender] = useState('');
  const lockedGender = user?.man_women_type === 0 ? 'male' : user?.man_women_type === 1 ? 'female' : '';
  const effectiveGender = lockedGender || gender;
  const effectiveBranchId = branchId || (user?.branch && user.branch > 0 ? String(user.branch) : '') || String(branches[0]?.id ?? '');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cafe-item-feedback-report', from, to, effectiveBranchId, effectiveGender],
    queryFn: async () => (await api.get<ItemFeedbackReport>('/cafe-products/reports/item-feedback', {
      params: { dateFrom: from, dateTo: to, branchId: effectiveBranchId || undefined, gender: effectiveGender || undefined },
    })).data,
    enabled: !!effectiveBranchId,
  });

  const selectPreset = (next: Preset) => {
    setPreset(next);
    if (next === 'custom') return;
    const range = presetRange(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const positiveRate = useMemo(() => {
    const positive = (data?.distribution ?? [])
      .filter((row) => row.rating >= 4)
      .reduce((sum, row) => sum + row.count, 0);
    return data?.totalRatings ? Math.round((positive / data.totalRatings) * 100) : 0;
  }, [data]);

  const chartRows = (data?.distribution ?? []).map((row) => ({
    ...row,
    label: `${toArabicDigits(row.rating)} ★`,
  }));

  return (
    <GymSalesPageShell
      section="sales"
      title={ui('تقييمات منتجات الكافيه')}
      description={ui('حوّل تقييم كل صنف وملاحظات العملاء إلى قرارات تحسين واضحة')}
    >
      <Card className="overflow-hidden border-0 bg-gradient-to-l from-amber-500/15 via-card to-card shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {([
              ['today', 'اليوم'],
              ['yesterday', 'أمس'],
              ['week', 'هذا الأسبوع'],
              ['month', 'هذا الشهر'],
              ['custom', 'فترة مخصصة'],
            ] as Array<[Preset, string]>).map(([value, label]) => (
              <Button key={value} size="sm" variant={preset === value ? 'default' : 'outline'} onClick={() => selectPreset(value)}>
                {ui(label)}
              </Button>
            ))}
          </div>
          {preset === 'custom' && <>
            <Input className="w-40" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input className="w-40" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </>}
          <select className="h-9 min-w-40 rounded-md border bg-background px-3 text-sm" value={effectiveBranchId} onChange={(event) => setBranchId(event.target.value)} disabled={branches.length <= 1}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <select aria-label="القسم" className="h-9 min-w-32 rounded-md border bg-background px-3 text-sm" value={effectiveGender} onChange={(event) => setGender(event.target.value)} disabled={!!lockedGender}><option value="">كل الأقسام</option><option value="male">رجال</option><option value="female">سيدات</option></select>
          <Badge variant="secondary" className="ms-auto nums">{toArabicDigits(from)} — {toArabicDigits(to)}</Badge>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState
          inline
          message={apiError(error, ui('تعذر تحميل تقييمات المنتجات. تحقق من نطاق الفرع والقسم ثم أعد المحاولة.'))}
          onRetry={() => void refetch()}
        />
      ) : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={MessageSquareText} label={ui('إجمالي التقييمات')} value={toArabicDigits(data?.totalRatings ?? 0)} />
        <Metric icon={Star} label={ui('متوسط التقييم')} value={`${toArabicDigits((data?.averageRating ?? 0).toFixed(1))} / ٥`} tone="amber" />
        <Metric icon={Sparkles} label={ui('تقييمات إيجابية')} value={`${toArabicDigits(positiveRate)}٪`} tone="emerald" />
        <Metric icon={AlertTriangle} label={ui('منتجات تحتاج اهتمامًا')} value={toArabicDigits(data?.needsAttention.length ?? 0)} tone="rose" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader><CardTitle>{ui('توزيع النجوم')}</CardTitle></CardHeader>
          <CardContent className="h-80">
            {isLoading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{ui('جاري التحميل…')}</div> :
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={46} tick={{ fontSize: 13 }} />
                  <Tooltip formatter={(value) => [toArabicDigits(Number(value)), ui('تقييم')]} />
                  <Bar dataKey="count" fill="#F59E0B" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>}
          </CardContent>
        </Card>

        <Card className="border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/10">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-rose-500" />{ui('أولوية التحسين')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.needsAttention ?? []).length === 0 ? <Empty text={ui('لا توجد منتجات منخفضة التقييم في هذه الفترة')} /> :
              data?.needsAttention.slice(0, 7).map((product) => <ProductScore key={`${product.productId}:${product.name}`} product={product} />)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="size-5 text-emerald-600" />{ui('الأعلى تقييمًا')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.bestRated ?? []).length === 0 ? <Empty text={ui('لا توجد تقييمات في هذه الفترة')} /> :
              data?.bestRated.slice(0, 8).map((product) => <ProductScore key={`${product.productId}:${product.name}`} product={product} />)}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b"><CardTitle>{ui('كل المنتجات المقيمة')}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground"><tr><th className="p-3 text-start">{ui('المنتج')}</th><th className="p-3 text-center">{ui('عدد التقييمات')}</th><th className="p-3 text-center">{ui('متوسط النجوم')}</th><th className="p-3 text-start">{ui('آخر ملاحظة')}</th></tr></thead>
                <tbody>{(data?.products ?? []).map((product) => <tr key={`${product.productId}:${product.name}`} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-semibold">{product.name}</td><td className="nums p-3 text-center">{toArabicDigits(product.ratingsCount)}</td><td className="p-3 text-center"><Stars value={product.averageRating} /></td><td className="max-w-xs p-3 text-muted-foreground">{product.comments[0]?.comment || '—'}</td></tr>)}</tbody>
              </table>
              {!isLoading && (data?.products ?? []).length === 0 && <Empty text={ui('لا توجد تقييمات في هذه الفترة')} />}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>{ui('أحدث ملاحظات العملاء')}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.recent ?? []).filter((row) => row.comment).map((row) => (
            <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{row.productName}</p><p className="nums text-xs text-muted-foreground">{ui('فاتورة')} #{toArabicDigits(row.dailyNumber)} · {toArabicDigits(row.saleDate)}</p></div><Stars value={row.rating} compact /></div>
              <p className="mt-3 rounded-xl bg-muted/55 p-3 text-sm leading-6">{row.comment}</p>
            </div>
          ))}
          {!isLoading && (data?.recent ?? []).filter((row) => row.comment).length === 0 && <Empty text={ui('لا توجد ملاحظات مكتوبة في هذه الفترة')} />}
        </CardContent>
      </Card>
      </>}
    </GymSalesPageShell>
  );
}

function Stars({ value, compact = false }: { value: number; compact?: boolean }) {
  return <div dir="ltr" className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`${compact ? 'size-3.5' : 'size-4'} ${star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25'}`} />)}
    {!compact && <span className="nums ms-1 text-xs font-bold">{toArabicDigits(value.toFixed(1))}</span>}
  </div>;
}

function ProductScore({ product }: { product: ProductFeedback }) {
  const { ui } = useLocale();
  return <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
    <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{toArabicDigits(product.ratingsCount)} {ui('تقييم')}</p></div>
    <Stars value={product.averageRating} />
  </div>;
}

function Metric({ icon: Icon, label, value, tone = 'primary' }: { icon: typeof Star; label: string; value: string; tone?: 'primary' | 'amber' | 'emerald' | 'rose' }) {
  const color = tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : tone === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : tone === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-primary/10 text-primary';
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-xl p-3 ${color}`}><Icon className="size-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="nums text-xl font-bold">{value}</p></div></CardContent></Card>;
}

function Empty({ text }: { text: string }) {
  return <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
