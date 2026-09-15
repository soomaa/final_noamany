import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { getAttendanceRules } from '@/lib/i18n-constants';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/store/locale';

interface RuleConfig {
  key: string;
  enabled: boolean;
  threshold?: string;
  graceMin?: string;
  multiplier?: string;
}

export function AttendanceRulesPage() {
  const { t, ui } = useLocale();
  const attendanceRules = useMemo(() => getAttendanceRules(t), [t]);
  const { data, refetch } = useQuery({
    queryKey: ['attendance', 'rules'],
    queryFn: async () => {
      const { data: rules } = await api.get<RuleConfig[]>('/attendance/rules');
      return rules;
    },
    retry: false,
  });

  const [localRules, setLocalRules] = useState<Record<string, RuleConfig>>({});

  const getRule = (key: string): RuleConfig => {
    const fromApi = data?.find((r) => r.key === key);
    return localRules[key] ?? fromApi ?? { key, enabled: true, threshold: '', graceMin: '', multiplier: '1' };
  };

  const updateRule = (key: string, patch: Partial<RuleConfig>) => {
    setLocalRules((prev) => ({ ...prev, [key]: { ...getRule(key), ...patch } }));
  };

  const saveAll = async () => {
    try {
      const payload = attendanceRules.map((r) => getRule(r.key));
      await api.patch('/attendance/rules', { rules: payload });
      toast.success(ui('تم حفظ قواعد الدوام'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('قواعد الدوام')}
        description={ui('التأخير · الانصراف المبكر · الغياب · الإضافي · الراحة الأسبوعية · العطلات · الساعات المرنة')}
        actions={<Button onClick={() => void saveAll()}>{ui('حفظ الكل')}</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {attendanceRules.map((rule) => {
          const cfg = getRule(rule.key);
          return (
            <Card key={rule.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{rule.label}</CardTitle>
                <Switch checked={cfg.enabled} onCheckedChange={(v) => updateRule(rule.key, { enabled: v })} />
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div><Label className="text-xs">{ui('الحد (د)')}</Label><Input className="mt-1 nums" value={cfg.threshold ?? ''} onChange={(e) => updateRule(rule.key, { threshold: e.target.value })} /></div>
                <div><Label className="text-xs">{ui('سماحية')}</Label><Input className="mt-1 nums" value={cfg.graceMin ?? ''} onChange={(e) => updateRule(rule.key, { graceMin: e.target.value })} /></div>
                <div><Label className="text-xs">{ui('المعامل')}</Label><Input className="mt-1 nums" value={cfg.multiplier ?? ''} onChange={(e) => updateRule(rule.key, { multiplier: e.target.value })} /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
