import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Bell, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { confirm } from '@/lib/confirm';
import { getAlertTypes } from '@/lib/i18n-constants';
import { useAlerts, useNotifications } from '@/hooks/use-notifications';
import { clientPaginate, isNotImplemented, useMutationWithToast } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type { AlertGroupKey, NotificationItem } from '@/types/notifications';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function NotificationsPage() {
  const { t, ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: notifications, isLoading, isError, error, refetch } = useNotifications();
  const { data: alerts, isError: alertsError, error: alertsErr } = useAlerts();

  const alertTypes = useMemo(() => getAlertTypes(t), [t]);

  const paged = useMemo(
    () =>
      clientPaginate(notifications ?? [], params, {
        search: (row, q) =>
          (row.title ?? '').toLowerCase().includes(q) || (row.body ?? '').toLowerCase().includes(q),
        filter: (row, filters) => {
          const readFilter = filters.isRead;
          if (!readFilter) return true;
          const wantRead = readFilter === '1';
          return row.read === wantRead;
        },
      }),
    [notifications, params],
  );

  const markAllRead = useMutationWithToast(
    () => api.patch('/notifications/read-all'),
    { success: ui('تم تعليم الكل كمقروء'), invalidate: ['notifications'] },
  );

  const markRead = async (id: number) => {
    await api.patch(`/notifications/${id}/read`);
    void refetch();
  };

  const columns: ColumnDef<NotificationItem>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'title',
      header: ui('الإشعار'),
      cell: ({ row }) => (
        <button
          type="button"
          className={cn('text-start', !row.original.read && 'font-semibold')}
          onClick={() => void markRead(row.original.id)}
        >
          {row.original.title ?? '—'}
        </button>
      ),
    },
    { accessorKey: 'body', header: ui('التفاصيل'), cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string || '—'}</span> },
    {
      id: 'datetime',
      header: ui('التاريخ'),
      cell: ({ row }) => (
        <span className="nums text-muted-foreground">
          {row.original.date ? toArabicDigits(row.original.date) : '—'}
          {row.original.time ? ` ${formatTime(row.original.time)}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'read',
      header: ui('الحالة'),
      cell: ({ getValue }) => (
        <span className={cn('text-xs', getValue() ? 'text-muted-foreground' : 'font-medium text-primary')}>
          {getValue() ? ui('مقروء') : ui('جديد')}
        </span>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الإشعارات')} />
        <NotImplementedState title={ui('الإشعارات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  const showAlertPlaceholders = alertsError && isNotImplemented(alertsErr);

  return (
    <div>
      <PageHeader
        title={ui('الإشعارات والتنبيهات')}
        description={ui('انتهاء العقود والبطاقة والتأمين · أعياد الميلاد · التجربة')}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate(undefined as never)}>
              <CheckCheck className="size-4" /> {ui('تعليم الكل كمقروء')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: ui('حذف كل الإشعارات؟'),
                  description: ui(`سيتم حذف ${paged.total} إشعار نهائيًا.`),
                  confirmLabel: ui('حذف الكل'),
                  variant: 'destructive',
                });
                if (ok) {
                  await api.delete('/notifications');
                  void refetch();
                  toast.success(ui('تم حذف الإشعارات'));
                }
              }}
            >
              {ui('حذف الكل')}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">{ui('التنبيهات')}</TabsTrigger>
          <TabsTrigger value="inbox">{ui('صندوق الإشعارات')}</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alertTypes.map((alertType) => {
              const key = alertType.key as AlertGroupKey;
              const items = alerts?.[key] ?? [];
              const count = showAlertPlaceholders ? 0 : items.length;
              return (
                <Card key={alertType.key} className={cn(count > 0 && 'border-warning/40')}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{alertType.label}</CardTitle>
                    <AlertTriangle className={cn('size-4', count > 0 ? 'text-warning' : 'text-muted-foreground')} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold nums">{toArabicDigits(count)}</p>
                    {items.slice(0, 3).map((item) => (
                      <p key={`${item.empId}-${item.date}`} className="mt-2 truncate text-xs text-muted-foreground">
                        <Link to={`/employees/${item.empId}`} className="hover:text-primary hover:underline">
                          {item.name ?? '—'}
                        </Link>
                        {' — '}
                        <span className="nums">{toArabicDigits(item.daysLeft)}</span> {ui('يوم')}
                      </p>
                    ))}
                    {showAlertPlaceholders && (
                      <p className="mt-2 text-xs text-muted-foreground">{ui('سيُفعّل مع اكتمال الخادم')}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="inbox">
          <FilterBar
            searchPlaceholder={ui('بحث في الإشعارات…')}
            fields={[
              {
                key: 'isRead',
                label: ui('الحالة'),
                type: 'select',
                options: [
                  { value: '0', label: ui('غير مقروء') },
                  { value: '1', label: ui('مقروء') },
                ],
              },
            ]}
            extra={
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Bell className="size-4" />
                <span className="nums">{toArabicDigits(paged.total)}</span>
              </div>
            }
          />
          <DataTable
            columns={columns}
            data={paged.data}
            total={paged.total}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            emptyTitle={ui('لا توجد إشعارات')}
            enableExport={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
