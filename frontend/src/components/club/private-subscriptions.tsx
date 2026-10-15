import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { clubPaymentMethodLabel } from '@/components/club/club-payment-method-select';
import { useClubT } from '@/hooks/use-club-t';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatMoney } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubPrivateEnrollment } from '@/types/club';
import { useLocale } from '@/store/locale';

export function PrivateEnrollmentsList() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubPrivateEnrollment>('club-private-subscriptions/enrollments', params);
  const columns = useMemo<ColumnDef<ClubPrivateEnrollment>[]>(() => [
    { id: 'index', header: '#', cell: ({ row }) => <span className="nums">{toArabicDigits((params.page - 1) * params.pageSize + row.index + 1)}</span> },
    { accessorKey: 'memberCode', header: ui('كود العضو') }, { accessorKey: 'memberName', header: ui('اسم العضو') }, { accessorKey: 'trainerName', header: ui('اسم المدرب') },
    { accessorKey: 'subscriptionType', header: ui('نوع الاشتراك') }, { accessorKey: 'registrationDate', header: ui('تاريخ التسجيل') },
    { id: 'period', header: ui('بداية من / إلى تاريخ'), cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.startDate)} — {toArabicDigits(row.original.endDate)}</span> },
    { accessorKey: 'sessionsCount', header: ui('عدد الحصص'), cell: ({ getValue }) => getValue() == null ? '—' : toArabicDigits(getValue() as number) },
    { accessorKey: 'subscriptionValue', header: ui('قيمة الاشتراك'), cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'discountType', header: ui('نوع الخصم'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    { accessorKey: 'discountValue', header: ui('قيمة الخصم'), cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'remainingAmount', header: ui('الباقي'), cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'receiptNumber', header: ui('رقم الإيصال'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      accessorKey: 'gender',
      header: ui('رجالي - حريمي'),
      cell: ({ getValue }) => getValue() === 'female'
        ? ui('حريمي')
        : getValue() === 'male'
          ? ui('رجالي')
          : '—',
    },
    {
      id: 'paymentMethod',
      header: ui('طريقة الدفع'),
      cell: ({ row }) => row.original.paymentMethods?.length
        ? row.original.paymentMethods.map((method) => clubPaymentMethodLabel(ct, method)).join(' + ')
        : clubPaymentMethodLabel(ct, row.original.paymentMethod),
    },
    { accessorKey: 'createdByName', header: ui('القائم بالإضافة'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => ({ active: ui('نشط'), expired: ui('منتهي'), upcoming: ui('قادم'), frozen: ui('موقوف') }[getValue() as string] ?? getValue()) },
    { id: 'actions', header: ui('الإجراء'), cell: () => '—' },
  ], [ct, params.page, params.pageSize]);
  return <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle={ui('لا توجد اشتراكات برايفت مسجلة')} />;
}
