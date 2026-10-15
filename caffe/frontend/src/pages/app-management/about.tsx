import { useMutation, useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { AppManagementShell } from './app-shell';

interface AboutApp {
  appName: string;
  appVersion: string | null;
  description: string | null;
  features: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  privacyPolicy: string | null;
  termsOfService: string | null;
}

export function AboutAppPage() {
  const { ui } = useLocale();
  const { data, refetch } = useQuery({
    queryKey: ['app', 'about'],
    queryFn: async () => {
      const { data: d } = await api.get<AboutApp>('/app/about');
      return d;
    },
  });
  const [form, setForm] = useState<AboutApp>({
    appName: '',
    appVersion: '',
    description: '',
    features: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    privacyPolicy: '',
    termsOfService: '',
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/app/about', form),
    onSuccess: () => {
      toast.success(ui('تم حفظ معلومات التطبيق'));
      void refetch();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <AppManagementShell
      title={ui('عن التطبيق')}
      description={ui('معلومات وبيانات التطبيق المحمول')}
      actions={
        <Button variant="brand" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="h-4 w-4" />
          {ui('حفظ')}
        </Button>
      }
    >
      <div className="grid gap-4 rounded-xl border bg-card p-6 md:grid-cols-2">
        <div className="grid gap-1">
          <Label>{ui('اسم التطبيق')}</Label>
          <Input value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>{ui('نسخة التطبيق')}</Label>
          <Input className="nums" value={form.appVersion ?? ''} onChange={(e) => setForm({ ...form, appVersion: e.target.value })} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <Label>{ui('الوصف')}</Label>
          <Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <Label>{ui('المميزات')}</Label>
          <Textarea value={form.features ?? ''} onChange={(e) => setForm({ ...form, features: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>{ui('البريد الإلكتروني')}</Label>
          <Input value={form.contactEmail ?? ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>{ui('الهاتف')}</Label>
          <Input className="nums" value={form.contactPhone ?? ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <Label>{ui('الموقع')}</Label>
          <Input value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <Label>{ui('سياسة الخصوصية')}</Label>
          <Textarea value={form.privacyPolicy ?? ''} onChange={(e) => setForm({ ...form, privacyPolicy: e.target.value })} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <Label>{ui('شروط الخدمة')}</Label>
          <Textarea value={form.termsOfService ?? ''} onChange={(e) => setForm({ ...form, termsOfService: e.target.value })} />
        </div>
      </div>
    </AppManagementShell>
  );
}
