import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import type { BusinessAuditEntry } from '@/types/gym-ops';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function BusinessAuditPage() {
  const { ui } = useLocale();
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ['business-audit', entityType, entityId, page, pageSize],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: BusinessAuditEntry[]; total: number }>('/club/audit', {
        params: {
          ...(entityType ? { entityType } : {}),
          ...(entityId ? { entityId } : {}),
          page,
          pageSize,
        },
      });
      return r;
    },
  });

  const columns = useMemo<ColumnDef<BusinessAuditEntry>[]>(
    () => [
      { accessorKey: 'createdAt', header: ui('التاريخ'), cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: 'entity',
        header: ui('الكيان'),
        cell: ({ row }) => {
          const entry = row.original;
          const snapshot = asRecord(entry.before) ?? asRecord(entry.after);
          if (entry.entityType !== 'club_member') return `${entry.entityType} #${entry.entityId}`;
          const name = typeof snapshot?.name === 'string' ? snapshot.name : null;
          const memberCode = typeof snapshot?.memberCode === 'string' ? snapshot.memberCode : null;
          return (
            <div className="min-w-40">
              <p className="font-medium">{name ? `${ui('عضو')}: ${name}` : `${ui('عضو')} #${entry.entityId}`}</p>
              <p className="text-xs text-muted-foreground nums">
                #{entry.entityId}{memberCode ? ` · ${memberCode}` : ''}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'action',
        header: ui('الإجراء'),
        cell: ({ getValue }) => {
          const action = getValue() as string;
          if (action === 'delete') return <span className="font-medium text-destructive">{ui('حذف عضو')}</span>;
          if (action === 'create') return ui('إضافة');
          if (action === 'update') return ui('تعديل');
          return action;
        },
      },
      {
        accessorKey: 'actorName',
        header: ui('بواسطة'),
        cell: ({ row }) => row.original.actorName ?? (row.original.actorUserId ? `#${row.original.actorUserId}` : '—'),
      },
      {
        id: 'details',
        header: ui('التفاصيل'),
        cell: ({ row }) => {
          const entry = row.original;
          const snapshot = asRecord(entry.before) ?? asRecord(entry.after);
          if (entry.entityType !== 'club_member' || !snapshot) return '—';
          const phone = typeof snapshot.phone === 'string' ? snapshot.phone : null;
          const subscriptions = typeof snapshot.subscriptions === 'number' ? snapshot.subscriptions : null;
          return (
            <span className="text-xs text-muted-foreground">
              {phone ? `${ui('رقم الموبايل')}: ${phone}` : ''}
              {phone && subscriptions != null ? ' · ' : ''}
              {subscriptions != null ? `${ui('الاشتراكات')}: ${subscriptions}` : ''}
              {!phone && subscriptions == null ? '—' : ''}
            </span>
          );
        },
      },
      { accessorKey: 'reason', header: ui('السبب'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    ],
    [ui],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('سجل التغييرات التشغيلي')}
        description={ui('اشتراكات · حضور · مدفوعات · حذف الأعضاء — كل تغيير موثّق باسم المنفّذ وتوقيته')}
      />
      <div className="flex flex-wrap gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('نوع الكيان')}</Label>
          <Input placeholder="club_member" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('معرف الكيان')}</Label>
          <Input placeholder="8" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
