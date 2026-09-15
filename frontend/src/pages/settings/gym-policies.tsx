import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface GymPolicies {
  allowCheckInWithOutstanding: boolean;
  outstandingAlertEnabled: boolean;
  outstandingAlertAfterSubscriptionPercent: number;
  allowRefunds: boolean;
}

const DEFAULTS: GymPolicies = {
  allowCheckInWithOutstanding: true,
  outstandingAlertEnabled: true,
  outstandingAlertAfterSubscriptionPercent: 50,
  allowRefunds: true,
};

export function GymPoliciesPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [form, setForm] = useState<GymPolicies>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['club-gym-policies'],
    queryFn: async () => {
      const { data: policies } = await api.get<GymPolicies>('/club/gym-policies');
      return policies;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: updated } = await api.patch<GymPolicies>('/club/gym-policies', {
        allowCheckInWithOutstanding: form.allowCheckInWithOutstanding,
        outstandingAlertEnabled: form.outstandingAlertEnabled,
        outstandingAlertAfterSubscriptionPercent: Number(form.outstandingAlertAfterSubscriptionPercent) || 0,
        allowRefunds: form.allowRefunds,
      });
      setForm(updated);
      void qc.invalidateQueries({ queryKey: ['club-gym-policies'] });
      toast.success(ui('تم حفظ سياسات الجيم'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('سياسات الجيم')}
        description={ui('تحكم في دخول الأعضاء عند وجود مبالغ متبقية وتنبيهات الاستقبال والاسترداد')}
        actions={
          <Button variant="brand" onClick={() => void save()} disabled={saving || isLoading}>
            {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{ui('الدخول مع وجود متبقي')}</CardTitle>
          <CardDescription>
            {ui('حدد هل يُسمح للعضو بتسجيل الحضور وهو عليه مبلغ متبقٍ على الاشتراك')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-outstanding">{ui('السماح بالدخول مع وجود متبقي')}</Label>
              <p className="text-sm text-muted-foreground">
                {form.allowCheckInWithOutstanding
                  ? ui('يمكن للعضو الدخول حتى مع وجود رصيد مستحق')
                  : ui('يُرفض الدخول تلقائياً إذا كان عليه مبلغ متبقٍ')}
              </p>
            </div>
            <Switch
              id="allow-outstanding"
              checked={form.allowCheckInWithOutstanding}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, allowCheckInWithOutstanding: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {form.allowCheckInWithOutstanding && (
        <Card>
          <CardHeader>
            <CardTitle>{ui('تنبيه الاستقبال')}</CardTitle>
            <CardDescription>
              {ui('عند تسجيل حضور عضو عليه متبقي، يظهر تنبيه للريسبشن بعد نسبة محددة من مدة الاشتراك')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="alert-enabled">{ui('تفعيل تنبيه المتبقي عند الحضور')}</Label>
                <p className="text-sm text-muted-foreground">
                  {ui('يظهر تحذير في شاشة الاستقبال أثناء تسجيل الدخول')}
                </p>
              </div>
              <Switch
                id="alert-enabled"
                checked={form.outstandingAlertEnabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, outstandingAlertEnabled: checked }))
                }
              />
            </div>

            {form.outstandingAlertEnabled && (
              <div className="grid max-w-md gap-2 rounded-lg border p-4">
                <Label htmlFor="alert-percent">
                  {ui('إرسال التنبيه بعد نسبة من مدة الاشتراك (%)')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {ui('مثال: 50 يعني بعد نصف فترة الاشتراك يبدأ التنبيه')}
                </p>
                <Input
                  id="alert-percent"
                  className="nums max-w-[8rem]"
                  type="number"
                  min={0}
                  max={100}
                  value={form.outstandingAlertAfterSubscriptionPercent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      outstandingAlertAfterSubscriptionPercent: Number(e.target.value),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground nums">
                  {ui('القيمة الحالية')}: {toArabicDigits(form.outstandingAlertAfterSubscriptionPercent)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ui('الاسترداد وإلغاء الاشتراك')}</CardTitle>
          <CardDescription>
            {ui('عند التفعيل تظهر صفحة استرداد وإلغاء الاشتراك في قسم الاشتراكات وتُسجَّل في المستردات')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-refunds">{ui('السماح بالاسترداد')}</Label>
              <p className="text-sm text-muted-foreground">
                {form.allowRefunds
                  ? ui('يمكن إلغاء الاشتراك وحساب المبلغ المسترد حسب المتبقي (أيام أو حصص)')
                  : ui('الاسترداد معطّل — لن تظهر صفحة الإلغاء والاسترداد')}
              </p>
            </div>
            <Switch
              id="allow-refunds"
              checked={form.allowRefunds}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, allowRefunds: checked }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
