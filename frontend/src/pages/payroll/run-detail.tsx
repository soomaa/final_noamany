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
import { isNotImplemented, usePaginatedList, useResource } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useState } from 'react';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';

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
  const { can } = usePermission();
  const canPrint = can('payroll.runs:print');
  const canApprove = can('payroll.runs:approve');
  const canExecute = can('payroll.runs:execute');
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { params, setParams } = useListQuery();
  const [actionLoading, setActionLoading] = useState(false);

  const { data: run, isLoading: runLoading, isError: runError, error: runErr, refetch: refetchRun } = useResource<PayrollRunDetail>('payroll/runs', id);
  const { data: lines, isLoading: linesLoading, isError: linesError, error: linesErr, refetch: refetchLines } = usePaginatedList<PayrollLineRow>(`payroll/runs/${id}/lines`, params, !!id);
  const { data: recon, refetch: refetchRecon } = useResource<{
    netPay?: number;
    payrollGlPayable?: number;
    bankPayment?: number;
    balanced?: boolean;
  }>('payroll/runs', id, 'reconciliation');

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
        title: `${ui('تنفيذ خطوة «')}${action}${ui('»؟')}`,
        description: ui('سيتم تطبيق التغييرات على المرتبات الشهرية — تأكد من مراجعة البيانات.'),
        confirmLabel: ui('تنفيذ'),
      });
      if (!ok) return;
    }
    setActionLoading(true);
    try {
      const { data } = await api.post<{ bankFile?: { filename: string; content: string } }>(
        `/payroll/runs/${id}/${action}`,
      );
      if (data?.bankFile?.content) {
        const blob = new Blob([data.bankFile.content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.bankFile.filename || 'bank.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(ui('تم تنفيذ الخطوة بنجاح'));
      void refetchRun();
      void refetchLines();
      void refetchRecon();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<PayrollLineRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'empCode', header: ui('كود'), cell: ({ getValue }) => <span className="nums">{formatDigits(getValue() as string ?? '—')}</span> },
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
        <NotImplementedState title={ui('المرتبات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => { void refetchRun(); void refetchLines(); }} />;

  return (
    <PrintView title={ui('كشف الرواتب')} className="space-y-6">
      <PageHeader
        title={ui('دورة الرواتب')}
        description={run ? `${run.title ?? run.month ?? ui('مرتبات شهر')}${run.year ? ` — ${toArabicDigits(run.year)}` : ''}` : undefined}
        actions={
          <div className="flex gap-2 no-print">
            {canPrint ? <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />{ui('طباعة')}</Button> : null}
            {canExecute && run?.status === 'posted' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading}
                onClick={() => void handleStepAction('unpost')}
              >
                {ui('عكس الترحيل')}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild><Link to="/payroll/runs"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>
          </div>
        }
      />

      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">{ui('مراحل المرتبات')}</CardTitle></CardHeader>
        <CardContent>
          <PayrollStepper
            currentStep={currentStep}
            onAction={(a) => void handleStepAction(a)}
            loading={actionLoading}
            canAction={(action) => action === 'print' ? canPrint : action === 'approve' ? canApprove : canExecute}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        {runLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
          <>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الحالة')}</CardTitle></CardHeader><CardContent><StatusBadge status={run?.status === 'approved' || run?.status === 'posted' || run?.status === 'banked' || run?.status === 'completed' ? (run.status === 'approved' ? 'approved' : 'paid') : 'pending'} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الموظفين')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold"><Num value={run?.employeeCount ?? lines?.total ?? 0} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('الإجمالي')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold"><Money value={run?.totalAmount} /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{ui('رقم المرتبات')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold nums">{formatDigits(id ?? '—')}</CardContent></Card>
          </>
        )}
      </div>

      {recon && (run?.status === 'posted' || run?.status === 'banked' || run?.status === 'completed') ? (
        <Card className="no-print">
          <CardHeader><CardTitle className="text-base">{ui('مطابقة المرتبات')}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
            <div>{ui('الصافي')}: <Money value={recon.netPay} /></div>
            <div>{ui('مستحقات الرواتب (GL)')}: <Money value={recon.payrollGlPayable} /></div>
            <div>{ui('صرف البنك')}: <Money value={recon.bankPayment} /></div>
            <div>{recon.balanced ? ui('متطابق 0.00') : ui('يوجد فرق — راجع القيود')}</div>
          </CardContent>
        </Card>
      ) : null}

      {linesLoading && !lines ? (
        <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <DataTable
          exportSource={{ resource: `payroll/runs/${id}/lines`, params }}
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
