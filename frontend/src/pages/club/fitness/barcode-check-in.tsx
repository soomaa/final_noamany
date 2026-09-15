import { ScanBarcode, Sparkles, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, apiError } from '@/lib/api';

type CheckInResult = { member?: { name?: string; memberCode?: string }; remaining?: number };

/** Reception scanner for SPA visits; no SPA reservations are created. */
export function SpaBarcodeCheckInPanel() {
  const [spaCode, setSpaCode] = useState('');
  const [saving, setSaving] = useState(false);

  const checkInSpa = async () => {
    if (!spaCode.trim()) return toast.error('امسح أو أدخل كود العضو أولاً');
    setSaving(true);
    try {
      const { data } = await api.post<CheckInResult>('/club-spa-attendance/barcode-check-in', { memberCode: spaCode.trim() });
      toast.success(`تم تسجيل سبا للعضو ${data.member?.name ?? spaCode} — المتبقي: ${data.remaining ?? 0}`);
      setSpaCode('');
    } catch (error) {
      toast.error(apiError(error, 'تعذر تسجيل زيارة السبا'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-primary"><Sparkles className="size-5" /><h2 className="font-semibold">دخول السبا بالباركود</h2></div>
      <p className="text-sm text-muted-foreground">يسجل زيارة واحدة يوميًا ويخصم من رصيد السبا في الاشتراك الفعّال فقط.</p>
      <Input autoFocus value={spaCode} onChange={(e) => setSpaCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void checkInSpa()} placeholder="امسح كود العضو" className="font-mono nums" />
      <Button className="w-full" onClick={() => void checkInSpa()} disabled={saving}><ScanBarcode className="size-4" /> تسجيل زيارة السبا</Button>
    </section>
  );
}

/** Reception scanner for class attendance; no class reservation is created. */
export function ClassBarcodeCheckInPanel() {
  const [classCode, setClassCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const consumedScan = useRef<string | null>(null);

  useEffect(() => {
    const scanned = searchParams.get('scan')?.trim();
    if (!scanned) {
      consumedScan.current = null;
      return;
    }
    setClassCode(scanned);
    const next = new URLSearchParams(searchParams);
    next.delete('scan');
    setSearchParams(next, { replace: true });
    if (consumedScan.current === scanned) return;
    consumedScan.current = scanned;
    setSaving(true);
    void api.post<CheckInResult>('/club-classes/barcode-check-in', { memberCode: scanned })
      .then(({ data }) => {
        toast.success(`تم تسجيل حضور الحصة للعضو ${data.member?.name ?? scanned}`);
        setClassCode('');
      })
      .catch((error) => toast.error(apiError(error, 'تعذر تسجيل حضور الحصة')))
      .finally(() => setSaving(false));
  }, [searchParams, setSearchParams]);

  const checkInClass = async () => {
    if (!classCode.trim()) {
      toast.error('امسح أو أدخل كود العضو أولاً');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<CheckInResult>('/club-classes/barcode-check-in', { memberCode: classCode.trim() });
      toast.success(`تم تسجيل حضور الحصة للعضو ${data.member?.name ?? classCode}`);
      setClassCode('');
    } catch (error) {
      toast.error(apiError(error, 'تعذر تسجيل حضور الحصة'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-primary"><UsersRound className="size-5" /><h2 className="font-semibold">حضور الحصص بالباركود</h2></div>
      <p className="text-sm text-muted-foreground">امسح كود العضو فقط؛ يحدد النظام الحصة الجارية الآن في الفرع. لا يُنشأ حجز.</p>
      <Input autoFocus value={classCode} onChange={(e) => setClassCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void checkInClass()} placeholder="امسح كود العضو" className="font-mono nums" />
      <Button className="w-full" onClick={() => void checkInClass()} disabled={saving}><ScanBarcode className="size-4" /> تسجيل حضور الحصة</Button>
    </section>
  );
}

/** Kept for older direct links; the sidebar now opens the separate barcode tabs. */
export function FitnessBarcodeCheckInPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="تسجيل الحضور بالباركود" description="يُحتسب الدخول من الاشتراك الفعّال للعضو؛ لا يتم إنشاء حجز للسبا أو الحصص." />
      <div className="grid gap-5 lg:grid-cols-2">
        <SpaBarcodeCheckInPanel />
        <ClassBarcodeCheckInPanel />
      </div>
    </div>
  );
}
