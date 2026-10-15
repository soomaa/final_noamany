import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Money } from '@/components/common/formatters';
import { PageHeader } from '@/components/common/page-header';
import { PrintView } from '@/components/common/print-view';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { isNotImplemented } from '@/lib/api-hooks';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface SlipPayload {
  run?: { id: number; title?: string; month?: string; year?: number };
  employee?: { empCode?: number; name?: string; jobTitle?: string };
  earnings?: Record<string, number | undefined>;
  deductions?: Record<string, number | undefined>;
  netSalary?: number;
  bank?: { account?: string; nameInBank?: string; code?: string };
}

const EARNING_LABELS: Record<string, string> = {
  basicSalary: uiStatic('الراتب الأساسي'),
  housing: uiStatic('بدل السكن'),
  transport: uiStatic('بدل المواصلات'),
  communication: uiStatic('بدل الاتصالات'),
  meal: uiStatic('بدل الإعاشة'),
  nature: uiStatic('بدل طبيعة العمل'),
  assignment: uiStatic('بدل التكليف'),
  overtime: uiStatic('إضافي'),
  bonus: uiStatic('مكافآت'),
  other: uiStatic('أخرى'),
  total: uiStatic('إجمالي الاستحقاق'),
};

const DEDUCTION_LABELS: Record<string, string> = {
  absence: uiStatic('غياب'),
  unpaidLeave: uiStatic('إجازة بدون راتب'),
  lateness: uiStatic('تأخير'),
  penalty: uiStatic('جزاءات'),
  insurance: uiStatic('تأمينات'),
  loan: uiStatic('سلف'),
  other: uiStatic('أخرى'),
  total: uiStatic('إجمالي الخصومات'),
};

function LineRows({ labels, data }: { labels: Record<string, string>; data?: Record<string, number | undefined> }) {
  if (!data) return null;
  return (
    <div className="space-y-2">
      {Object.entries(labels).map(([key, label]) => {
        const v = data[key];
        if (v == null || v === 0) return null;
        return (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className={key === 'total' ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
            <Money value={v} />
          </div>
        );
      })}
    </div>
  );
}

export function PayrollSlipPage() {
  const { ui } = useLocale();
  const { id, empId } = useParams<{ id: string; empId: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'slip', id, empId],
    queryFn: async () => {
      const { data: d } = await api.get<SlipPayload>(`/payroll/runs/${id}/slip/${empId}`);
      return d;
    },
    enabled: !!id && !!empId,
    retry: false,
  });

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('كشف راتب')} />
        <NotImplementedState title={ui('كشف الراتب قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <PrintView title={ui('كشف راتب موظف')} className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={ui('مسيرة الرواتب')}
        title={ui('كشف راتب موظف')}
        description={
          isLoading
            ? ui('جاري التحميل…')
            : `${data?.employee?.name ?? '—'} — ${data?.run?.title ?? ''}`
        }
        actions={
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> {ui('طباعة')}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/payroll/runs/${id}`}>
                <ArrowRight className="size-4" /> {ui('العودة للمسيرة')}
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card className="overflow-hidden border-primary/10 shadow-md">
            <div className="h-1.5 bg-brand-gradient" />
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{data?.employee?.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ui('كود')} {toArabicDigits(data?.employee?.empCode ?? '—')} · {data?.employee?.jobTitle ?? '—'}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-muted-foreground">{ui('صافي الراتب')}</p>
                  <p className="text-3xl font-bold text-primary">
                    <Money value={data?.netSalary} />
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-success">{ui('الاستحقاقات')}</h3>
                <LineRows labels={EARNING_LABELS} data={data?.earnings} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-destructive">{ui('الخصومات')}</h3>
                <LineRows labels={DEDUCTION_LABELS} data={data?.deductions} />
              </div>
            </CardContent>
            {data?.bank?.account && (
              <>
                <Separator />
                <CardContent className="pt-4 text-sm text-muted-foreground">
                  {ui('التحويل البنكي:')} {data.bank.nameInBank ?? '—'} · {ui('حساب')}{' '}
                  <span className="nums font-medium text-foreground">{data.bank.account}</span>
                </CardContent>
              </>
            )}
          </Card>
        </>
      )}
    </PrintView>
  );
}
