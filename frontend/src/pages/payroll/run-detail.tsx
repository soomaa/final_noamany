import { ArrowRight, Loader2, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/common/data-table';
import { Money, Num } from '@/components/common/formatters';
import { PageHeader } from '@/components/common/page-header';
import { PayrollStepper, statusToPayrollStep } from '@/components/common/payroll-stepper';
import { PrintView } from '@/components/common/print-view';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { downloadBlob } from '@/lib/export';
import { isNotImplemented, usePaginatedList, useResource } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useState } from 'react';
import { useLocale } from '@/store/locale';

interface PayrollRunDetail {
  id: number;
  title?: string;
  month?: string;
  year?: number;
  status?: string;
  totalAmount?: number;
  employeeCount?: number;
}

interface PayrollLineRow {
  id: number;
  empCode?: string;
  employeeName?: string;
  basicSalary?: number;
  allowances?: number;
  deductions?: number;
  netSalary?: number;
}

export function PayrollRunDetailPage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { params, setParams } = useListQuery();
  const [actionLoading, setActionLoading] = useState(false);

  const { data: run, isLoading: runLoading, isError: runError, error: runErr, refetch: refetchRun } = useResource<PayrollRunDetail>('payroll/runs', id);
  const { data: lines, isLoading: linesLoading, isError: linesError, error: linesErr, refetch: refetchLines } = usePaginatedList<PayrollLineRow>(`payroll/runs/${id}/lines`, params, !!id);

  const currentStep = statusToPayrollStep(run?.status);
  const error = runErr ?? linesErr;
  const isError = runError || linesError;

  const handleStepAction = async (action: string) => {
    if (action === 'print') {
      window.print();
      return;
    }
    if (['calculate', 'post', 'bank'].includes(action)) {
      const ok = await confirm({
        title: ui(`تنفيذ خطوة «${action}»؟`),
        description: ui('سيتم تطبيق التغييرات على مسيرة الرواتب — تأكد من مراجعة البيانات.'),
        confirmLabel: ui('تنفيذ'),
      });
      if (!ok) return;
    }
    setActionLoading(true);
    try {
      await api.post(`/payroll/runs/${id}/${action}`);
      if (action === 'bank') {
        const { data: bankFile } = await api.get<{ filename: string; content: string }>(`/payroll/runs/${id}/bank-file`);
        downloadBlob(new Blob([bankFile.content], { type: 'text/csv;charset=utf-8' }), bankFile.filename);
      }
      toast.success(ui('تم تنفيذ الخطوة بنجاح'));
      void refetchRun();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<PayrollLineRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'empCode', header: ui('كود'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string ?? '—')}</span> },
    { accessorKey: 'employeeName', header: ui('الاسم') },
    { accessorKey: 'basicSalary', header: ui('الأساسي'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'allowances', header: ui('البدلات'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'deductions', header: ui('الخصومات'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'netSalary', header: ui('الصافي'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    {
      id: 'slip',
      header: ui('كشف'),
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/payroll/runs/${id}/slip/${row.original.id}`}>
            <Printer className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('دورة الرواتب')} />
        <NotImplementedState title={ui('المسيرة قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => { void refetchRun(); void refetchLines(); }} />;

  return (
    <PrintView title={ui('كشف الرواتب')} className="space-y-6">
      <PageHeader
        title={ui('دورة الرواتب')}
        description={run ? `${run.title ?? run.month ?? ui('مسيرة')}${run.year ? ` — ${toArabicDigits(run.year)}` : ''}` : undefined}
        actions={
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />{ui('طباعة')}</Button>
            <Button variant="outline" size="sm" asChild><Link to="/payroll/runs"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>
          </div>
        }
      />

      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">{ui('مراحل المسيرة')}</CardTitle></CardHeader>
        <CardContent>
          <PayrollStepper currentStep={currentStep} onAction={(a) => void handleStepAction(a)} loading={actionLoading} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        {runLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
          <>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الحالة')}</CardTitle></CardHeader><CardContent><StatusBadge status={run?.status === 'approved' ? 'approved' : 'pending'} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الموظفين')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold"><Num value={run?.employeeCount ?? lines?.total ?? 0} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الإجمالي')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold"><Money value={run?.totalAmount} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('رقم المسيرة')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold nums">{toArabicDigits(id ?? '—')}</CardContent></Card>
          </>
        )}
      </div>

      {linesLoading && !lines ? (
        <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <DataTable
          columns={columns}
          data={lines?.data ?? []}
          total={lines?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={linesLoading}
          emptyTitle={ui('لا توجد بنود')}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
        />
      )}
    </PrintView>
  );
}
