import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { BranchFilter } from '@/components/reports/branch-filter';
import { ReportAudienceFilter, type ReportAudience } from '@/components/reports/audience-filter';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getReportKeys } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';

interface ReportRow {
  id: number;
  [key: string]: unknown;
}

export function ReportDetailPage() {
  const { ui, t } = useLocale();
  const { key } = useParams<{ key: string }>();
  const meta = useMemo(() => getReportKeys(t).find((r) => r.key === key), [t, key]);
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const lockedAudience: ReportAudience | null =
    user?.man_women_type === 0 ? 'male' : user?.man_women_type === 1 ? 'female' : null;
  const selectedAudience = params.filters.gender === 'male' || params.filters.gender === 'female'
    ? params.filters.gender
    : 'all';
  const audience = lockedAudience ?? selectedAudience;

  const { data, isLoading, isError, error, refetch } = usePaginatedList<ReportRow>(
    `reports/${key}`,
    params,
    !!key,
  );

  const columns: ColumnDef<ReportRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'name', header: ui('الاسم') },
    { accessorKey: 'value', header: ui('القيمة') },
  ];

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
        extra={
          <div className="flex flex-wrap gap-3">
            <BranchFilter
              value={params.filters.branchId ?? 'all'}
              onChange={(branchId) => setParams({ filters: { branchId: branchId === 'all' ? '' : branchId }, page: 1 })}
            />
            <ReportAudienceFilter
              value={audience}
              onChange={(gender) => setParams({ filters: { gender: gender === 'all' ? '' : gender }, page: 1 })}
              locked={lockedAudience !== null}
            />
          </div>
        }
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
