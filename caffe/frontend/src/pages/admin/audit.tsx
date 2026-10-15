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

export function AuditPage() {
  const { ui } = useLocale();
  const [skip, setSkip] = useState(0);
  const take = 50;
  const { data, isLoading, isError, refetch } = useAudit(skip, take);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={ui('إدارة النظام')}
        title={ui('سجل التدقيق')}
        description={ui('كل التغييرات على الأدوار والصلاحيات والاستثناءات وإسناد الأدوار.')}
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
                      <Badge variant="secondary">{ACTION_LABELS[r.action] ?? r.action}</Badge>
                    </td>
                    <td className="px-4 py-2">{r.actorName ?? r.actorUserId ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.targetType ? `${r.targetType} #${r.targetId}` : '—'}
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
          {data ? `${skip + 1}–${skip + data.rows.length} ${ui('من')} ${data.total}` : ''}
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
