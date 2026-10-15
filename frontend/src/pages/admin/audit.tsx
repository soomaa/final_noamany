import { formatDisplayNumber } from '@/lib/number-display';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudit } from '@/hooks/use-rbac';
import { useLocale } from '@/store/locale';
import { formatDateTime } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { usePermission } from '@/hooks/use-permission';
import { downloadCsv } from '@/components/reports/report-shell';
import { Download } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  'role.create': uiStatic('إنشاء دور'),
  'role.update': uiStatic('تعديل دور'),
  'role.clone': uiStatic('نسخ دور'),
  'role.delete': uiStatic('حذف دور'),
  'role.matrix.update': uiStatic('تعديل صلاحيات دور'),
  'role.assign': uiStatic('إسناد أدوار لمستخدم'),
  'exception.update': uiStatic('تعديل استثناءات'),
  'exception.clear': uiStatic('مسح استثناءات'),
};

const TARGET_LABELS: Record<string, string> = {
  role: uiStatic('دور وصلاحيات'),
  user: uiStatic('مستخدم'),
  exception: uiStatic('استثناء مستخدم'),
  permissions: uiStatic('صلاحيات'),
};

const TARGET_REFERENCE_LABELS: Record<string, string> = {
  role: uiStatic('رقم الدور'),
  user: uiStatic('رقم حساب المستخدم'),
  exception: uiStatic('رقم استثناء المستخدم'),
  permissions: uiStatic('مرجع تعديل الصلاحيات'),
};

export function AuditPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canExport = can('admin.audit:export');
  const [skip, setSkip] = useState(0);
  const take = 50;
  const { data, isLoading, isError, refetch } = useAudit(skip, take);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={ui('إدارة النظام')}
        title={ui('سجل التدقيق')}
        description={ui('كل التغييرات على الأدوار والصلاحيات والاستثناءات وإسناد الأدوار.')}
        actions={canExport && data?.rows.length ? <Button variant="outline" size="sm" onClick={() => downloadCsv('rbac-audit.csv', [
          [ui('الإجراء'), ui('المنفّذ'), ui('الهدف'), ui('مرجع العملية'), ui('التاريخ')],
          ...data.rows.map((row) => [
            ACTION_LABELS[row.action] ?? ui('إجراء صلاحيات'),
            row.actorName ?? (row.actorUserId ? `${ui('حساب قديم غير مسمى، رقمه')} ${row.actorUserId}` : ui('النظام تلقائيًا')),
            TARGET_LABELS[row.targetType ?? ''] ?? ui('سجل صلاحيات'),
            row.targetId ?? '',
            formatDateTime(row.createdAt),
          ]),
        ])}><Download className="size-4" />{ui('تصدير')}</Button> : null}
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState title={ui('لا توجد سجلات')} description={ui('لم تُسجّل أي تغييرات بعد.')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{ui('الإجراء')}</th>
                  <th className="px-4 py-2 text-start font-medium">{ui('المنفّذ')}</th>
                  <th className="px-4 py-2 text-start font-medium">{ui('الهدف')}</th>
                  <th className="px-4 py-2 text-start font-medium">{ui('التاريخ')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="px-4 py-2">
                      <Badge variant="secondary">{ACTION_LABELS[r.action] ?? ui('إجراء صلاحيات')}</Badge>
                    </td>
                    <td className="px-4 py-2">{r.actorName ?? (r.actorUserId ? `${ui('حساب قديم غير مسمى، رقمه')} ${r.actorUserId}` : ui('النظام تلقائيًا'))}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.targetType ? `${TARGET_LABELS[r.targetType] ?? ui('سجل صلاحيات')}${r.targetId ? ` — ${TARGET_REFERENCE_LABELS[r.targetType] ?? ui('مرجع العملية')}: ${r.targetId}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>
          {ui('السابق')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {data ? `${formatDisplayNumber(skip + 1)}–${formatDisplayNumber(skip + data.rows.length)} ${ui('من')} ${formatDisplayNumber(data.total)}` : ''}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || skip + take >= data.total}
          onClick={() => setSkip(skip + take)}
        >
          {ui('التالي')}
        </Button>
      </div>
    </div>
  );
}
