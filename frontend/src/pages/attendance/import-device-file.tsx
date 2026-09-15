import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

export function AttendanceImportPage() {
  const { ui } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!file) return toast.error(ui('اختر ملف XLSX أولاً'));
    const body = new FormData(); body.append('hdoor_file', file);
    setSaving(true);
    try {
      const { data } = await api.post<{ imported: number; replacedDates: number }>('/attendance/imports/device-file', body);
      toast.success(`${ui('تم استيراد')} ${data.imported} ${ui('سجل حضور')}`); setFile(null);
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  return <div className="space-y-6">
    <PageHeader title={ui('استيراد ملف جهاز الحضور')} description={ui('نفس ترتيب الأعمدة العشرة المستخدم في النظام القديم')} />
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-6">
      <div className="space-y-2"><Label htmlFor="attendance-file">{ui('ملف XLSX')}</Label><Input id="attendance-file" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      <p className="text-sm text-muted-foreground">{ui('الأعمدة: كود الموظف، الاسم، التاريخ، الحضور، الانصراف، الحضور الفعلي، الانصراف الفعلي، الغياب، ساعات العمل، الإدارة.')}</p>
      <Button disabled={saving || !file} onClick={() => void submit()}>{saving ? ui('جاري الاستيراد…') : ui('استيراد الملف')}</Button>
    </div>
  </div>;
}
