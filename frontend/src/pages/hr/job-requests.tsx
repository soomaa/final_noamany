import type { ColumnDef } from '@tanstack/react-table';
import { Briefcase, FileUser, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface JobRequestRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

interface ApplicationRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  jobRequestId?: number;
}

export function JobRequestsPage() {
  const { ui } = useLocale();
  const [tab, setTab] = useState<'requests' | 'applications'>('requests');
  const { params, setParams } = useListQuery();

  const requests = usePaginatedList<JobRequestRow>('hr/job-requests', params, tab === 'requests');
  const applications = usePaginatedList<ApplicationRow>(
    'hr/job-requests/applications',
    params,
    tab === 'applications',
  );

  const active = tab === 'requests' ? requests : applications;

  const stats = useMemo(() => {
    if (tab === 'requests') {
      return [
        { title: ui('طلبات الاحتياج'), value: toArabicDigits(requests.data?.total ?? 0), icon: <Briefcase className="size-5" /> },
      ];
    }
    return [
      { title: ui('طلبات المتقدمين'), value: toArabicDigits(applications.data?.total ?? 0), icon: <FileUser className="size-5" /> },
    ];
  }, [tab, requests.data?.total, applications.data?.total]);

  const requestColumns: ColumnDef<JobRequestRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('المسمى / الطلب') },
    {
      accessorKey: 'employeeName',
      header: ui('العدد المطلوب'),
      cell: ({ getValue }) => <span className="nums">{getValue() ? toArabicDigits(getValue() as string) : '—'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
  ];

  const applicationColumns: ColumnDef<ApplicationRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('المتقدم') },
    { accessorKey: 'title', header: ui('الوظيفة') },
    {
      accessorKey: 'jobRequestId',
      header: ui('رقم الطلب'),
      cell: ({ getValue }) => <span className="nums">{getValue() != null ? toArabicDigits(getValue() as number) : '—'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
  ];

  return (
    <ListPageShell
      title={ui('طلبات التوظيف')}
      description={ui('احتياج وظيفي وطلبات المتقدمين')}
      searchPlaceholder={tab === 'requests' ? ui('بحث في الطلبات…') : ui('بحث في المتقدمين…')}
      stats={stats}
      statsLoading={active.isLoading}
      isError={active.isError}
      error={active.error}
    >
      <Tabs value={tab} onValueChange={(v) => { setTab(v as 'requests' | 'applications'); setParams({ page: 1 }); }}>
        <TabsList>
          <TabsTrigger value="requests" className="gap-2">
            <Briefcase className="size-4" /> {ui('الاحتياج الوظيفي')}
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <Users className="size-4" /> {ui('طلبات المتقدمين')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <DataTable
            columns={requestColumns}
            data={requests.data?.data ?? []}
            total={requests.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={requests.isLoading}
            isError={requests.isError}
            onRetry={() => void requests.refetch()}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            emptyTitle={ui('لا توجد طلبات احتياج')}
          />
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <DataTable
            columns={applicationColumns}
            data={applications.data?.data ?? []}
            total={applications.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={applications.isLoading}
            isError={applications.isError}
            onRetry={() => void applications.refetch()}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            emptyTitle={ui('لا توجد طلبات متقدمين')}
          />
        </TabsContent>
      </Tabs>
    </ListPageShell>
  );
}
