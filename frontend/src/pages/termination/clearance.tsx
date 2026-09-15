import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Eye, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface ClearanceRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

interface ClearanceGroup {
  id: number;
  empId?: number;
  employeeName?: string;
  lines?: {
    id: number;
    adminstrationId?: string;
    responsibleEmpId?: string;
    notes?: string;
    resignation?: string;
    employeeCard?: string;
    medicalCard?: string;
    socialInsurance?: string;
  }[];
}

const LINE_LABELS: Record<string, string> = {
  resignation: uiStatic('الاستقالة'),
  employeeCard: uiStatic('بطاقة الموظف'),
  medicalCard: uiStatic('البطاقة الطبية'),
  socialInsurance: uiStatic('التأمينات'),
};

export function ClearancePage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClearanceRow>('termination/clearance', params);
  const [groupId, setGroupId] = useState<number | null>(null);

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['termination/clearance', groupId],
    queryFn: async () => {
      const { data: g } = await api.get<ClearanceGroup>(`/termination/clearance/${groupId}`);
      return g;
    },
    enabled: groupId != null,
  });

  const stats = useMemo(
    () => [
      { title: ui('طلبات إخلاء الطرف'), value: toArabicDigits(data?.total ?? 0), icon: <ClipboardList className="size-5" /> },
      {
        title: ui('إجمالي الأقسام (هذه الصفحة)'),
        value: toArabicDigits((data?.data ?? []).reduce((s, r) => s + parseInt(r.employeeName ?? '0', 10), 0)),
        icon: <Layers className="size-5" />,
      },
    ],
    [data],
  );

  const columns: ColumnDef<ClearanceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('رقم المجموعة'),
      cell: ({ row, getValue }) => (
        <button
          type="button"
          className="nums font-medium text-primary hover:underline"
          onClick={() => setGroupId(row.original.id)}
        >
          {toArabicDigits(getValue() as number)}
        </button>
      ),
    },
    {
      accessorKey: 'title',
      header: ui('الموظف'),
      cell: ({ row, getValue }) => (
        <button type="button" className="text-start hover:underline" onClick={() => setGroupId(row.original.id)}>
          {(getValue() as string | undefined) ?? '—'}
        </button>
      ),
    },
    {
      accessorKey: 'employeeName',
      header: ui('عدد الإدارات'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string ?? '0')}</span>,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" aria-label={ui('عرض التفاصيل')} onClick={() => setGroupId(row.original.id)}>
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('إخلاء طرف')}
        description={ui('طلبات ومتابعة إخلاء الطرف مجمّعة حسب رقم الطلب')}
        searchPlaceholder={ui('بحث باسم الموظف…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
      >
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
          emptyTitle={ui('لا توجد طلبات إخلاء طرف')}
        />
      </ListPageShell>

      <Sheet open={groupId != null} onOpenChange={(o) => !o && setGroupId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{ui('إخلاء طرف')} — {group?.employeeName ?? '…'}</SheetTitle>
            <SheetDescription>
              {ui('مجموعة رقم')} <span className="nums">{groupId != null ? toArabicDigits(groupId) : ''}</span>
            </SheetDescription>
          </SheetHeader>
          {groupLoading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : group ? (
            <div className="mt-6 space-y-3">
              {(group.lines ?? []).map((line) => (
                <div key={line.id} className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">{ui('إدارة:')}<span className="nums">{line.adminstrationId ?? '—'}</span></p>
                  {line.responsibleEmpId && line.responsibleEmpId !== '0' && (
                    <p className="mt-1 text-muted-foreground">
                      {ui('المسؤول:')} <span className="nums">{line.responsibleEmpId}</span>
                    </p>
                  )}
                  {line.notes && <p className="mt-2 text-muted-foreground">{line.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(LINE_LABELS).map(([key, label]) => {
                      const val = line[key as keyof typeof line];
                      if (!val) return null;
                      return (
                        <span key={key} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {label}: {val}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
