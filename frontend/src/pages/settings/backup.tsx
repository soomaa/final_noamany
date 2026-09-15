import { Database, Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

async function downloadCsv(path: string, filename: string) {
  const { data } = await api.get<string>(path, { responseType: 'text' });
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupSettingsPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const branchParam = branchId && branchId !== 'all' ? `?branchId=${branchId}` : '';

  const runExport = async (kind: 'members' | 'subscriptions') => {
    setLoading(kind);
    try {
      const path =
        kind === 'members'
          ? `/club/backup/members.csv${branchParam}`
          : `/club/backup/subscriptions.csv${branchParam}`;
      await downloadCsv(path, `${kind}-export.csv`);
      toast.success(ui('تم التصدير بنجاح'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('النسخ الاحتياطي والتصدير')}
        description={ui('تصدير بيانات الأعضاء والاشتراكات كملف CSV')}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            {ui('نطاق التصدير')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <label className="text-sm font-medium">{ui('الفرع')}</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">{ui('كل الفروع')}</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={loading !== null}
              onClick={() => void runExport('members')}
            >
              <Download className="me-2 h-4 w-4" />
              {loading === 'members' ? ui('جاري التصدير…') : ui('تصدير الأعضاء CSV')}
            </Button>
            <Button
              variant="outline"
              disabled={loading !== null}
              onClick={() => void runExport('subscriptions')}
            >
              <Download className="me-2 h-4 w-4" />
              {loading === 'subscriptions' ? ui('جاري التصدير…') : ui('تصدير الاشتراكات CSV')}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {ui('للاستعادة الكاملة استخدم نسخ قاعدة البيانات على مستوى الخادم. هذا التصدير للتقارير والنسخ الاحتياطي التشغيلي.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
