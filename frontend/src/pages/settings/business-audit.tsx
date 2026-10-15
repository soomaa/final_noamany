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
import { toArabicDigits, formatDigits } from '@/lib/utils';
import type { BusinessAuditEntry } from '@/types/business-audit';
import { uiStatic } from '@/lib/ui-static';
import {
  auditActionLabel,
  auditEntityFilters,
  auditEntityLabel,
  auditReferenceLabel,
} from '@/ports/audit-label-registry';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstText(snapshot: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = snapshot?.[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value);
  }
  return null;
}

function statusLabel(value: string): string {
  return ({ active: uiStatic('نشط'), inactive: uiStatic('غير نشط'), approved: uiStatic('معتمد'), rejected: uiStatic('مرفوض'), cancelled: uiStatic('ملغي'), paid: uiStatic('مدفوع'), posted: uiStatic('مرحل') } as Record<string, string>)[value] ?? value;
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
      const { data: r } = await api.get<{ data: BusinessAuditEntry[]; total: number }>('/business-audit', {
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
        header: ui('ما الذي تم تغييره؟'),
        cell: ({ row }) => {
          const entry = row.original;
          const snapshot = asRecord(entry.before) ?? asRecord(entry.after);
          const entityLabel = ui(auditEntityLabel(entry.entityType));
          const name = firstText(snapshot, ['employeeName', 'name', 'title', 'displayName']);
          const recordCode = firstText(snapshot, ['employeeCode', 'code']);
          const referenceLabel = ui(auditReferenceLabel(entry.entityType));
          return (
            <div className="min-w-40">
              <p className="font-medium">{name ? `${entityLabel}: ${name}` : entityLabel}</p>
              <p className="text-xs text-muted-foreground nums">
                {recordCode ? `${ui('كود الموظف')}: ${toArabicDigits(recordCode)} · ` : ''}{referenceLabel}: {formatDigits(entry.entityId)}
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
          const readable = ui(auditActionLabel(action));
          return action.includes('delete') || action === 'refund'
            ? <span className="font-medium text-destructive">{readable}</span>
            : readable;
        },
      },
      {
        accessorKey: 'actorName',
        header: ui('من قام بالإجراء؟'),
        cell: ({ row }) => row.original.actorName ?? (row.original.actorUserId ? ui('مستخدم سابق — الاسم غير متاح') : ui('النظام تلقائيًا')),
      },
      {
        id: 'details',
        header: ui('التفاصيل'),
        cell: ({ row }) => {
          const entry = row.original;
          const snapshot = asRecord(entry.before) ?? asRecord(entry.after);
          if (!snapshot) return '—';
          const details = [
            [ui('رقم الموبايل'), firstText(snapshot, ['phone', 'mobile'])],
            [ui('كود الموظف'), firstText(snapshot, ['employeeCode'])],
            [ui('التاريخ'), firstText(snapshot, ['date', 'attendanceDate'])],
            [ui('الحالة'), firstText(snapshot, ['status'])],
          ].filter((item): item is [string, string] => Boolean(item[1])).slice(0, 3);
          return (
            <span className="text-xs text-muted-foreground">{details.length
              ? details.map(([key, value]) => `${key}: ${key === ui('الحالة') ? statusLabel(value) : value}`).join(' · ')
              : '—'}</span>
          );
        },
      },
      { accessorKey: 'reason', header: ui('السبب'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    ],
    [ui],
  );
  const projectAuditEntry = (entry: BusinessAuditEntry) => {
    const snapshot = asRecord(entry.before) ?? asRecord(entry.after);
    return {
      date: formatDateTime(entry.createdAt),
      entity: ui(auditEntityLabel(entry.entityType)),
      reference: `${ui(auditReferenceLabel(entry.entityType))}: ${formatDigits(entry.entityId)}`,
      action: ui(auditActionLabel(entry.action)),
      actor: entry.actorName ?? (entry.actorUserId ? ui('مستخدم سابق — الاسم غير متاح') : ui('النظام تلقائيًا')),
      reason: entry.reason ?? '—',
      subject: firstText(snapshot, ['employeeName', 'name', 'title', 'displayName']) ?? '—',
    };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('سجل التغييرات التشغيلي')}
        description={ui('كل تغيير في الموارد البشرية موثّق باسم المنفّذ وتوقيته ومعرّف الارتباط')}
      />
      <div className="flex flex-wrap gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('نوع السجل')}</Label>
          <select className="h-10 min-w-52 rounded-md border border-input bg-background px-3 text-sm" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            <option value="">{ui('كل أنواع السجلات')}</option>
            {auditEntityFilters().map(([value, label]) => <option key={value} value={value}>{ui(label)}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('رقم السجل (اختياري)')}</Label>
          <Input inputMode="numeric" placeholder={ui('مثال: رقم تسجيل الحضور ١٠٢٥')} value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
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
        exportSource={{
          resource: 'business-audit',
          params: {
            page,
            pageSize,
            search: '',
            filters: {
              ...(entityType ? { entityType } : {}),
              ...(entityId ? { entityId } : {}),
            },
          },
          project: projectAuditEntry,
        }}
        exportColumns={[
          { key: 'date', header: ui('التاريخ') },
          { key: 'entity', header: ui('ما الذي تم تغييره؟') },
          { key: 'subject', header: ui('الاسم') },
          { key: 'reference', header: ui('مرجع العملية') },
          { key: 'action', header: ui('الإجراء') },
          { key: 'actor', header: ui('من قام بالإجراء؟') },
          { key: 'reason', header: ui('السبب') },
        ]}
      />
    </div>
  );
}
