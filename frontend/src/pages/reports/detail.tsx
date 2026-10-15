import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getReportKeys } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ReportRow {
  id: number;
  [key: string]: unknown;
}

function reportHeader(key: string, ui: (s: string) => string): string {
  const labels: Record<string, string> = {
    name: ui('الاسم'),
    value: ui('القيمة'),
    department: ui('الإدارة'),
    jobTitle: ui('المسمى الوظيفي'),
    salary: ui('الراتب'),
    daysLeft: ui('الأيام المتبقية'),
    reason: ui('السبب'),
    checkOut: ui('الانصراف'),
    lateMin: ui('دقائق التأخير'),
    date: ui('التاريخ'),
    workDays: ui('أيام العمل'),
    basicSalary: ui('الراتب الأساسي'),
    penalties: ui('الجزاءات'),
    late: ui('التأخير'),
    advances: ui('السلف'),
    housing: ui('بدل السكن'),
    transport: ui('بدل النقل'),
    empCode: ui('كود الموظف'),
    from: ui('من'),
    to: ui('إلى'),
    total: ui('الإجمالي'),
    used: ui('المستخدم'),
  };
  return labels[key] ?? ui(key);
}

function isDateKey(key: string): boolean {
  return /date|from|to/i.test(key) && !/lateMin|workDays|daysLeft/i.test(key);
}

function renderCell(key: string, value: unknown) {
  if (value == null || value === '') return '—';
  if (isDateKey(key) && (typeof value === 'string' || value instanceof Date)) {
    return <DateText value={value} />;
  }
  if (typeof value === 'number' || (typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) && /min|days|salary|value|total|used|late|penalties|advances|housing|transport|code/i.test(key))) {
    return <span className="nums">{toArabicDigits(value as string | number)}</span>;
  }
  return <span className="nums">{String(value)}</span>;
}

export function ReportDetailPage() {
  const { ui, t } = useLocale();
  const { key } = useParams<{ key: string }>();
  const meta = useMemo(() => getReportKeys(t).find((r) => r.key === key), [t, key]);
  const { params, setParams } = useListQuery();

  const { data, isLoading, isError, error, refetch } = usePaginatedList<ReportRow>(
    `reports/${key}`,
    params,
    !!key,
  );

  const columns: ColumnDef<ReportRow>[] = useMemo(() => {
    const rows = data?.data ?? [];
    const first = rows[0];
    const keys = first
      ? Object.keys(first).filter((k) => k !== 'id')
      : ['name', 'value'];
    if (rows.some((row) => row.checkOut != null && row.checkOut !== '') && !keys.includes('checkOut')) {
      keys.push('checkOut');
    }
    if (rows.some((row) => row.lateMin != null && row.lateMin !== '') && !keys.includes('lateMin')) {
      keys.push('lateMin');
    }

    const dynamic: ColumnDef<ReportRow>[] = keys.map((col) => ({
      accessorKey: col,
      header: reportHeader(col, ui),
      cell: ({ getValue }) => renderCell(col, getValue()),
    }));

    return [
      {
        accessorKey: 'id',
        header: ui('م'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      ...dynamic,
    ];
  }, [data?.data, params.page, params.pageSize, ui]);

  if (!meta) {
    return <NotImplementedState title={ui('تقرير غير معروف')} />;
  }

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={meta.title} />
        <NotImplementedState title={ui('التقرير قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={meta.title} description={ui('تقرير')} />
      <FilterBar
        searchPlaceholder={ui('بحث في التقرير…')}
        fields={[{ key: 'date', label: ui('التاريخ'), type: 'date' }]}
      />
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
        emptyTitle={ui('لا توجد نتائج للتقرير')}
      />
    </div>
  );
}
