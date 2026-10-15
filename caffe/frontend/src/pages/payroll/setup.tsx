import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Settings } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPayrollComponents } from '@/lib/i18n-constants';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const CATEGORY_KEYS: Record<string, string> = {
  earning: uiStatic('استحقاق'),
  allowance: uiStatic('بدل'),
  deduction: uiStatic('استقطاع'),
};

interface PayComponentRow {
  id: number;
  title?: string;
  type?: string;
  category?: string;
  amount?: number;
  isActive?: boolean;
}

export function PayrollSetupPage() {
  const { t, ui } = useLocale();
  const payrollComponents = useMemo(() => getPayrollComponents(t), [t]);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayComponentRow>('payroll/components', params);

  const categoryLabel = (category?: string) =>
    category && CATEGORY_KEYS[category] ? ui(CATEGORY_KEYS[category]) : category ?? '—';

  const columns: ColumnDef<PayComponentRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'title', header: ui('المكون') },
    {
      accessorKey: 'category',
      header: ui('التصنيف'),
      cell: ({ getValue }) => categoryLabel(getValue() as string),
    },
    { accessorKey: 'type', header: ui('النوع') },
    { accessorKey: 'amount', header: ui('القيمة الافتراضية'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'isActive', header: ui('الحالة'), cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'suspended'} /> },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('إعداد الرواتب')} />
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {payrollComponents.map((c) => (
            <Card key={c.key}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{c.label}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">{categoryLabel(c.category)}</CardContent>
            </Card>
          ))}
        </div>
        <NotImplementedState title={ui('مكونات الراتب قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('إعداد الرواتب')}
        description={ui('الراتب الأساسي والبدلات والاستقطاعات والتأمينات والضرائب')}
        actions={<Button variant="brand" size="sm"><Settings className="size-4" />{ui('مكون جديد')}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {payrollComponents.map((c) => (
          <Card key={c.key} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{categoryLabel(c.category)}</CardContent>
          </Card>
        ))}
      </div>

      <FilterBar searchPlaceholder={ui('بحث في مكونات الراتب…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا توجد مكونات — أضف من البطاقات أعلاه')}
      />
    </div>
  );
}
