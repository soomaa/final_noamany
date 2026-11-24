import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type PunchStatus = 'applied' | 'duplicate' | 'rejected' | 'retry';

interface PunchResult {
  row: number;
  empCode: string;
  name: string;
  date: string;
  time: string;
  column: 'in' | 'out' | null;
  status: PunchStatus;
  message?: string;
  type?: 'in' | 'out';
}

interface ImportSummary {
  fileName: string;
  deviceId: number | null;
  received: number;
  applied: number;
  duplicate: number;
  rejected: number;
  retry: number;
  emptyRows: number;
  results: PunchResult[];
}

interface DeviceOption { id: number; title?: string; branchTitle?: string }

const STATUS_LABEL: Record<PunchStatus, string> = {
  applied: 'سُجلت',
  duplicate: 'مكررة',
  rejected: 'مرفوضة',
  retry: 'لم تُسجل مؤقتاً',
};
const STATUS_VARIANT: Record<PunchStatus, 'success' | 'secondary' | 'destructive' | 'warning'> = {
  applied: 'success',
  duplicate: 'secondary',
  rejected: 'destructive',
  retry: 'warning',
};

export function AttendanceImportPage() {
  const { ui } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [filter, setFilter] = useState<PunchStatus | 'problems' | 'all'>('problems');
  // Optional: only users who can see the devices page get the picker; others import by employee branch.
  const devices = useQuery({
    queryKey: ['attendance', 'devices', 'import-options'],
    queryFn: async () => (await api.get<{ data: DeviceOption[] }>('/attendance/devices', { params: { pageSize: 100 } })).data.data,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const submit = async () => {
    if (!file) return toast.error(ui('اختر ملف XLSX أولاً'));
    const body = new FormData();
    body.append('hdoor_file', file);
    if (deviceId) body.append('deviceId', deviceId);
    setSaving(true);
    try {
      const { data } = await api.post<ImportSummary>('/attendance/imports/device-file', body, { timeout: 10 * 60_000 });
      setSummary(data);
      setFilter(data.rejected + data.retry > 0 ? 'problems' : 'all');
      if (data.applied) toast.success(`${ui('تم تسجيل')} ${toArabicDigits(String(data.applied))} ${ui('بصمة في الحضور')}`);
      else toast.message(ui('لم تُسجل بصمات جديدة من هذا الملف'));
      setFile(null);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => (summary?.results ?? []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'problems') return r.status === 'rejected' || r.status === 'retry';
    return r.status === filter;
  }), [summary, filter]);

  const chip = (value: typeof filter, label: string, count: number, tone = '') => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-lg border px-4 py-3 text-start transition ${filter === value ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted'}`}
    >
      <div className="text-xs text-muted-foreground">{ui(label)}</div>
      <div className={`nums text-2xl font-bold ${tone}`}>{toArabicDigits(String(count))}</div>
    </button>
  );

  return <div className="space-y-6">
    <PageHeader
      title={ui('استيراد ملف جهاز الحضور')}
      description={ui('كل بصمة حضور أو انصراف فعلية في الملف تُسجل في الحضور كأنها بصمة من الجهاز، وتظهر في اللوحة والتقارير والرواتب')}
    />
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-6">
      <div className="space-y-2">
        <Label htmlFor="attendance-file">{ui('ملف XLSX')}</Label>
        <Input id="attendance-file" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {!!devices.data?.length && <div className="space-y-2">
        <Label htmlFor="attendance-device">{ui('جهاز البصمة (اختياري)')}</Label>
        <select
          id="attendance-device"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          <option value="">{ui('بدون جهاز — فرع كل موظف')}</option>
          {devices.data.map((d) => <option key={d.id} value={String(d.id)}>{d.title ?? `#${d.id}`}{d.branchTitle ? ` — ${d.branchTitle}` : ''}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{ui('عند اختيار جهاز تُسجل البصمات على فرع الجهاز.')}</p>
      </div>}
      <p className="text-sm text-muted-foreground">{ui('الأعمدة: كود الموظف، الاسم، التاريخ، الحضور، الانصراف، الحضور الفعلي، الانصراف الفعلي، الغياب، ساعات العمل، الإدارة. يُقرأ منها الحضور الفعلي والانصراف الفعلي فقط.')}</p>
      <p className="text-sm text-muted-foreground">{ui('رفع نفس الملف مرة أخرى آمن: البصمات المسجلة تظهر كمكررة، والمرفوضة سابقاً تُعاد محاولتها.')}</p>
      <Button disabled={saving || !file} onClick={() => void submit()}>{saving ? ui('جاري تسجيل البصمات… قد يستغرق دقائق') : ui('استيراد الملف')}</Button>
    </div>

    {summary && <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {ui('نتيجة الملف')}: <span className="font-medium text-foreground">{summary.fileName}</span>
        {' · '}{ui('عدد البصمات')} <span className="nums">{toArabicDigits(String(summary.received))}</span>
        {summary.emptyRows > 0 && <> · {ui('أيام بدون بصمة (غياب)')} <span className="nums">{toArabicDigits(String(summary.emptyRows))}</span></>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {chip('applied', 'سُجلت في الحضور', summary.applied, 'text-success')}
        {chip('duplicate', 'مكررة (مسجلة من قبل)', summary.duplicate)}
        {chip('rejected', 'مرفوضة', summary.rejected, summary.rejected ? 'text-destructive' : '')}
        {chip('retry', 'لم تُسجل مؤقتاً', summary.retry, summary.retry ? 'text-warning' : '')}
        {chip('problems', 'تحتاج مراجعة', summary.rejected + summary.retry)}
      </div>
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setFilter('all')}>{ui('عرض الكل')}</Button></div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {['الصف', 'الكود', 'الاسم', 'التاريخ', 'الوقت', 'العمود', 'النتيجة', 'السبب'].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">{ui(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{ui('لا توجد بصمات في هذا التصنيف')}</td></tr>}
            {rows.slice(0, 1000).map((r, index) => (
              <tr key={`${r.row}-${r.column}-${index}`} className={`border-t ${r.status === 'rejected' ? 'bg-destructive/5' : ''}`}>
                <td className="nums px-3 py-2">{toArabicDigits(String(r.row))}</td>
                <td className="nums px-3 py-2">{toArabicDigits(r.empCode)}</td>
                <td className="px-3 py-2">{r.name || '—'}</td>
                <td className="nums px-3 py-2">{r.date ? toArabicDigits(r.date) : '—'}</td>
                <td className="nums px-3 py-2">{r.time ? toArabicDigits(r.time) : '—'}</td>
                <td className="px-3 py-2">{r.column ? ui(r.column === 'in' ? 'حضور فعلي' : 'انصراف فعلي') : '—'}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{ui(STATUS_LABEL[r.status])}</Badge>
                  {r.status === 'applied' && r.type && <span className="ms-1 text-xs text-muted-foreground">{ui(r.type === 'in' ? 'حضور' : 'انصراف')}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 1000 && <div className="border-t p-3 text-center text-xs text-muted-foreground">{ui('يُعرض أول ١٠٠٠ صف فقط')}</div>}
      </div>
    </div>}
  </div>;
}
