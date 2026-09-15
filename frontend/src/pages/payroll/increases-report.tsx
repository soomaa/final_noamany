import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { usePaginatedList } from '@/lib/api-hooks';
import { downloadExcel } from '@/lib/export';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface SalaryIncreaseRow extends Record<string, unknown> {
  id: number;
  employeeId: number;
  employeeCode: number;
  employeeName: string;
  value: number;
  date: string;
}

export function SalaryIncreasesReportPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<SalaryIncreaseRow>('payroll/salary-increases', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const [exporting, setExporting] = useState(false);

  const columns = useMemo<ColumnDef<SalaryIncreaseRow>[]>(() => [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'employeeName', header: ui('اسم الموظف') },
    { accessorKey: 'employeeCode', header: ui('كود الموظف'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'date', header: ui('تاريخ الزيادة'), cell: ({ getValue }) => <DateText value={getValue() as string} /> },
    { accessorKey: 'value', header: ui('مقدار الزيادة'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
  ], [params.page, params.pageSize, ui]);

  const exportReport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllReportRows<SalaryIncreaseRow>('/payroll/salary-increases', {
        ...params.filters,
        search: params.search || undefined,
      }, 500);
      await downloadExcel(rows, [
        { key: 'employeeName', header: ui('اسم الموظف') },
        { key: 'employeeCode', header: ui('كود الموظف') },
        { key: 'date', header: ui('تاريخ الزيادة') },
        { key: 'value', header: ui('مقدار الزيادة') },
      ], 'زيادات_الرواتب', ui('زيادات الرواتب'));
      toast.success(ui('تم تنزيل ملف Excel بنجاح'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ui('تعذر تصدير التقرير'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={ui('زيادات المرتبات خلال فترة')}
        description={ui('عرض زيادات الرواتب حسب الموظف والفترة مع إمكانية التصدير إلى Excel.')}
        actions={<Button variant="outline" size="sm" onClick={() => void exportReport()} disabled={exporting}><Download className="size-4" />{exporting ? ui('جارٍ التصدير…') : ui('تصدير Excel')}</Button>}
      />
      <FilterBar
        searchPlaceholder={ui('بحث باسم الموظف أو الكود…')}
        fields={[
          { key: 'employeeId', label: ui('اسم الموظف'), type: 'select', options: employeeOptions },
          { key: 'dateFrom', label: ui('من تاريخ'), type: 'date' },
          { key: 'dateTo', label: ui('إلى تاريخ'), type: 'date' },
        ]}
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        onExportExcel={exportReport}
        emptyTitle={ui('لا توجد زيادات في الفترة المحددة')}
      />
    </div>
  );
}
