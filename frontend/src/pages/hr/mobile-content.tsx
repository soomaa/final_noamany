import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

type HrMobileContent = {
  about: { title: string; body: string };
  privacy: { title: string; body: string };
  updatedAt: string;
};

const EMPTY: HrMobileContent = {
  about: { title: '', body: '' },
  privacy: { title: '', body: '' },
  updatedAt: '',
};

/** HR-only settings for the employee Flutter application, not the general member app. */
export function HrMobileContentPage() {
  const { ui } = useLocale();
  const [form, setForm] = useState<HrMobileContent>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr-mobile-content'],
    queryFn: async () => (await api.get<HrMobileContent>('/hr/mobile-content')).data,
  });

  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: saved } = await api.put<HrMobileContent>('/hr/mobile-content', {
        aboutTitle: form.about.title,
        aboutBody: form.about.body,
        privacyTitle: form.privacy.title,
        privacyBody: form.privacy.body,
      });
      setForm(saved);
      toast.success(ui('تم حفظ محتوى تطبيق الموارد البشرية'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('محتوى تطبيق الموظفين')}
        description={ui('صفحتا عن التطبيق وسياسة الخصوصية الخاصة بتطبيق الموارد البشرية فقط')}
        actions={<Button variant="brand" onClick={() => void save()} disabled={isLoading || saving}><Save className="size-4" />{saving ? ui('جارٍ الحفظ…') : ui('حفظ')}</Button>}
      />
      <Card>
        <CardHeader><CardTitle>{ui('عن تطبيق الموظفين')}</CardTitle><CardDescription>{ui('يظهر للموظف من صفحة عن التطبيق داخل تطبيق Flutter.')}</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2"><Label>{ui('العنوان')}</Label><Input value={form.about.title} onChange={(e) => setForm((v) => ({ ...v, about: { ...v.about, title: e.target.value } }))} /></div>
          <div className="grid gap-2"><Label>{ui('المحتوى')}</Label><Textarea rows={7} value={form.about.body} onChange={(e) => setForm((v) => ({ ...v, about: { ...v.about, body: e.target.value } }))} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{ui('سياسة خصوصية الموارد البشرية')}</CardTitle><CardDescription>{ui('تظهر للموظف فقط، ولا تؤثر على سياسة تطبيق الأعضاء أو النظام العام.')}</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2"><Label>{ui('العنوان')}</Label><Input value={form.privacy.title} onChange={(e) => setForm((v) => ({ ...v, privacy: { ...v.privacy, title: e.target.value } }))} /></div>
          <div className="grid gap-2"><Label>{ui('المحتوى')}</Label><Textarea rows={10} value={form.privacy.body} onChange={(e) => setForm((v) => ({ ...v, privacy: { ...v.privacy, body: e.target.value } }))} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
