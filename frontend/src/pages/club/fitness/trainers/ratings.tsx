import type { ColumnDef } from '@tanstack/react-table';
import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { clientPaginate } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { useFitnessResourceList } from '../shared';

export function FitnessTrainerRatingsPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { items: trainers, isLoading, isError, refetch } = useFitnessResourceList<ClubTrainerRow>('club-trainers');

  const paginated = useMemo(() => {
    const sorted = [...trainers].sort((a, b) => b.ratingAvg - a.ratingAvg);
    return clientPaginate(sorted, params, {
      search: (item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.specialization?.toLowerCase().includes(q) ?? false),
    });
  }, [trainers, params]);

  const columns = useMemo<ColumnDef<ClubTrainerRow>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        cell: ({ row }) => (
          <span className="nums font-medium">
            {toArabicDigits((params.page - 1) * params.pageSize + row.index + 1)}
          </span>
        ),
      },
      { accessorKey: 'name', header: ft('common.name') },
      { accessorKey: 'specialization', header: ft('trainers.specialization'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      {
        accessorKey: 'ratingAvg',
        header: ft('trainers.rating'),
        cell: ({ getValue }) => (
          <span className="flex items-center gap-1 nums font-medium text-amber-600">
            <Star className="size-4 fill-current" />
            {toArabicDigits(getValue() as number)}
          </span>
        ),
      },
    ],
    [ft, params.page, params.pageSize],
  );

  const hasRatings = trainers.some((t) => t.ratingAvg > 0);

  return (
    <div className="space-y-6">
      <PageHeader title={ft('trainerRatings.title')} />
      {!hasRatings && trainers.length > 0 && (
        <p className="text-sm text-muted-foreground">{ft('trainerRatings.noData')}</p>
      )}
      <DataTable
        columns={columns}
        data={paginated.data}
        total={paginated.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('common.noData')}
      />
    </div>
  );
}
