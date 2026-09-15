import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LockKeyhole, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useAuth } from '@/store/auth';

const METHOD_LABELS: Record<string, string> = {
  cash: uiStatic('نقدي'),
  card: uiStatic('بطاقة'),
  visa: uiStatic('فيزا'),
  instapay: uiStatic('إنستا باي'),
  wallet: uiStatic('محفظة'),
  bank: uiStatic('حساب بنكي'),
  transfer: uiStatic('تحويل بنكي'),
  online: uiStatic('إلكتروني'),
};

const SOURCE_LABELS: Record<string, string> = {
  receipt: uiStatic('إيصال'),
  subscription: uiStatic('اشتراك'),
  locker: uiStatic('لوكر'),
  spa: uiStatic('سبا'),
  inbody: 'InBody',
  quick_service: uiStatic('مبيعات ID / Session'),
};

type PeriodMode = 'today' | 'all' | 'range';

function monthStart(today = localToday()): string {
  return `${today.slice(0, 8)}01`;
}

function normalizeRange(from: string, to: string): { dateFrom: string; dateTo: string } {
  if (from && to && from > to) return { dateFrom: to, dateTo: from };
  return { dateFrom: from, dateTo: to };
}

export function ClubTreasuryPage() {
  const ct = useClubT();
  const { user } = useAuth();
  const { can, canRoute } = usePermission();
  const queryClient = useQueryClient();
  const { data: branches = [] } = useBranches();
  const isSystemAdmin = user?.level === 1;
  const [branchId, setBranchId] = useState('');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: '',
    amount: '',
    paymentMethod: 'نقدي',
    description: '',
  });
  const [periodMode, setPeriodMode] = useState<PeriodMode>('today');
  const [dateFrom, setDateFrom] = useState(() => monthStart());
  const [dateTo, setDateTo] = useState(() => localToday());
  const canRecordExpense =
    can('financial-reports.expenses:create') ||
    can('club.subscriptions.treasury:create');

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['expense-categories', 'treasury-active'],
    queryFn: async () => {
      const { data } = await api.get<Array<{ id: number; name: string; isActive: boolean }>>(
        '/expense-categories',
        { params: { activeOnly: true } },
      );
      return data;
    },
    enabled: canRecordExpense,
  });

  const saveExpense = async () => {
    const amount = Number(expenseForm.amount);
    const targetBranchId = isSystemAdmin ? Number(branchId) : Number(user?.branch ?? 0);
    if (!expenseForm.category.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('اختر نوع المصروف وأدخل مبلغًا صحيحًا');
      return;
    }
    if (!targetBranchId) {
      toast.error('اختر الفرع أولًا لتسجيل المصروف');
      return;
    }
    setExpenseSaving(true);
    try {
      await api.post('/expenses', {
        expenseDate: localToday(),
        category: expenseForm.category.trim(),
        amount,
        paymentMethod: expenseForm.paymentMethod,
        paymentStatus: 'مدفوع',
        description: expenseForm.description.trim() || undefined,
        branchId: targetBranchId,
      });
      toast.success('تم تسجيل المصروف باسم المستخدم الحالي');
      setExpenseOpen(false);
      setExpenseForm({ category: '', amount: '', paymentMethod: 'نقدي', description: '' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['club-treasury'] }),
        queryClient.invalidateQueries({ queryKey: ['me', 'workspace', 'widgets'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExpenseSaving(false);
    }
  };

  const queryParams = useMemo(() => {
    const selectedBranchId = isSystemAdmin ? branchId || undefined : user?.branch || undefined;
    if (periodMode === 'today') {
      const d = localToday();
      return { date: d, dateFrom: d, dateTo: d, branchId: selectedBranchId };
    }
    if (periodMode === 'all') return { branchId: selectedBranchId };
    const { dateFrom: from, dateTo: to } = normalizeRange(dateFrom, dateTo);
    if (!from || !to) {
      const today = localToday();
      return { date: today, dateFrom: today, dateTo: today, branchId: selectedBranchId };
    }
    return { dateFrom: from, dateTo: to, branchId: selectedBranchId };
  }, [periodMode, dateFrom, dateTo, isSystemAdmin, branchId, user?.branch]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [
      'club-treasury',
      periodMode,
      queryParams.dateFrom ?? '',
      queryParams.dateTo ?? '',
      queryParams.date ?? '',
      queryParams.branchId ?? 'all',
    ],
    queryFn: async () => {
      const { data: r } = await api.get<{
        date: string | null;
        dateFrom: string | null;
        dateTo: string | null;
        periodMode: string;
        total: number;
        byMethod: Record<string, number>;
        summaryOnly: boolean;
        detailRangeLimitDays: number;
        lockedUser: boolean;
        selectedUserId: number | null;
        entries: Array<{ source: string; customerName: string; amount: number; paymentMethod: string }>;
      }>('/club-dashboard/treasury', { params: queryParams });
      return r;
    },
  });

  const periodTabs: { id: PeriodMode; label: string }[] = [
    { id: 'today', label: ct('subscriptions.periodToday') },
    { id: 'all', label: ct('subscriptions.periodAll') },
    { id: 'range', label: ct('subscriptions.periodRange') },
  ];

  const periodCaption =
    periodMode === 'today'
      ? localToday()
      : periodMode === 'all'
        ? ct('subscriptions.periodAll')
        : `${dateFrom || '—'} → ${dateTo || '—'}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('subscriptions.treasury')}
        description={
          isSystemAdmin
            ? 'متابعة كل التحصيلات مع إمكانية اختيار الفرع'
            : 'تظهر هنا التحصيلات التي سجلتها أنت فقط في فرع حسابك'
        }
        actions={(canRecordExpense || canRoute('/finance/expenses')) ? (
          <div className="flex flex-wrap gap-2">
            {canRecordExpense ? (
              <Button variant="brand" onClick={() => setExpenseOpen(true)}>
                <ReceiptText className="size-4" />
                تسجيل مصروف
              </Button>
            ) : null}
            {canRoute('/finance/expenses') ? (
              <Button variant="outline" asChild>
                <Link to="/finance/expenses">إدارة المصروفات</Link>
              </Button>
            ) : null}
          </div>
        ) : undefined}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-56 gap-2">
          <Label>{ct('common.branch')}</Label>
          {isSystemAdmin ? (
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">كل الفروع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name ?? `#${branch.id}`}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/45 px-3 text-sm">
              <Building2 className="size-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">{user?.branch_name ?? 'فرع الحساب'}</span>
              <LockKeyhole className="size-3.5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Label>{ct('subscriptions.period')}</Label>
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
            {periodTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPeriodMode(tab.id);
                  if (tab.id === 'today') {
                    const d = localToday();
                    setDateFrom(d);
                    setDateTo(d);
                  }
                  if (tab.id === 'range') {
                    setDateFrom(monthStart());
                    setDateTo(localToday());
                  }
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  periodMode === tab.id
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {periodMode === 'range' && (
          <>
            <div className="grid gap-2">
              <Label>{ct('common.dateFrom')}</Label>
              <Input
                type="date"
                className="nums w-[11.5rem]"
                dir="ltr"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.dateTo')}</Label>
              <Input
                type="date"
                className="nums w-[11.5rem]"
                dir="ltr"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground nums">
        {ct('subscriptions.period')}: {periodCaption}
        {isFetching ? ` · ${ct('common.loading')}` : ''}
      </p>

      {error && (
        <p className="text-sm text-destructive">{ct('common.noData')}</p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>}

      {data && (
        <>
          {data.summaryOnly && (
            <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
              تم حساب إجماليات الفترة كاملة بدون تحميل التفاصيل لحماية أداء النظام. التفاصيل متاحة
              لفترة لا تتجاوز{' '}
              <span className="nums font-semibold">
                {toArabicDigits(data.detailRangeLimitDays)}
              </span>{' '}
              يومًا.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <ClubStatCard label={ct('subscriptions.totalPaid')} value={data.total} />
            {Object.entries(data.byMethod).map(([method, amount]) => (
              <ClubStatCard
                key={method}
                label={METHOD_LABELS[method] ?? method}
                value={amount}
              />
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-start">{ct('common.customer')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.source')}</th>
                  <th className="p-2 text-start">{ct('common.amount')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.paymentMethod')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      {data.summaryOnly
                        ? 'التفاصيل غير محمّلة لهذه الفترة؛ الإجماليات بالأعلى تشمل الفترة كاملة'
                        : ct('common.noData')}
                    </td>
                  </tr>
                )}
                {data.entries.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{e.customerName}</td>
                    <td className="p-2">{SOURCE_LABELS[e.source] ?? e.source}</td>
                    <td className="p-2 nums">{toArabicDigits(e.amount)}</td>
                    <td className="p-2">{METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>تسجيل مصروف جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-xl border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              سيُحفظ المصروف باسم <span className="font-semibold text-foreground">{user?.name ?? 'المستخدم الحالي'}</span>
              {' '}وفي {isSystemAdmin ? (branches.find((branch) => String(branch.id) === branchId)?.name ?? 'الفرع المختار') : (user?.branch_name ?? 'فرع الحساب')}.
            </div>
            <div className="grid gap-2">
              <Label>نوع المصروف</Label>
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={expenseForm.category}
                onChange={(event) => setExpenseForm((form) => ({ ...form, category: event.target.value }))}
              >
                <option value="">اختر نوع المصروف</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.name}>{category.name}</option>
                ))}
                {expenseCategories.length === 0 ? (
                  <>
                    <option value="مصروفات تشغيل">مصروفات تشغيل</option>
                    <option value="صيانة">صيانة</option>
                    <option value="مرافق">مرافق</option>
                    <option value="أخرى">أخرى</option>
                  </>
                ) : null}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>المبلغ</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="nums"
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((form) => ({ ...form, amount: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>طريقة الدفع</Label>
                <select
                  className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={expenseForm.paymentMethod}
                  onChange={(event) => setExpenseForm((form) => ({ ...form, paymentMethod: event.target.value }))}
                >
                  <option value="نقدي">نقدي</option>
                  <option value="بطاقة">بطاقة</option>
                  <option value="تحويل بنكي">تحويل بنكي</option>
                  <option value="محفظة">محفظة</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>البيان</Label>
              <Textarea
                value={expenseForm.description}
                onChange={(event) => setExpenseForm((form) => ({ ...form, description: event.target.value }))}
                placeholder="تفاصيل المصروف (اختياري)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>إلغاء</Button>
            <Button variant="brand" onClick={() => void saveExpense()} disabled={expenseSaving}>
              {expenseSaving ? 'جارٍ الحفظ…' : 'حفظ المصروف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
