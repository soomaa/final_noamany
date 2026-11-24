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

/** Only the values the attendance calculation actually reads, per rule. */
const RULE_FIELDS: Record<string, { key: 'threshold' | 'graceMin' | 'multiplier'; label: string; unit: string }[]> = {
  late: [{ key: 'graceMin', label: 'سماحية', unit: 'دقيقة' }],
  early_leave: [{ key: 'graceMin', label: 'سماحية', unit: 'دقيقة' }],
  overtime: [
    { key: 'threshold', label: 'أقل مدة تتحسب إضافي', unit: 'دقيقة' },
    { key: 'multiplier', label: 'المعامل', unit: '× الدقائق' },
  ],
};

const RULE_HELP: Record<string, string> = {
  late: 'التأخير لحد السماحية دي بيتسامح فيه، واللي بعدها بس اللي بيتحسب.',
  early_leave: 'الانصراف المبكر لحد السماحية دي بيتسامح فيه، واللي بعدها بس اللي بيتحسب.',
  overtime: 'الإضافي اللي أقل من المدة دي مش بيتحسب، واللي يتحسب بيتضرب في المعامل.',
};

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
      toast.success(ui('تم حفظ الإعدادات'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('سماحية التأخير والإضافي')}
        description={ui('دقائق السماح في التأخير والانصراف المبكر، وأقل مدة تتحسب إضافي. مواعيد الشفتات من «مواعيد الشفتات»، وقيم الخصم في المرتب من «إعدادات الحضور والمرتبات».')}
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
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{ui(RULE_HELP[rule.key] ?? 'مفيش قيم لهذه القاعدة؛ التشغيل والإيقاف بس.')}</p>
                {(RULE_FIELDS[rule.key] ?? []).length > 0 && <div className="grid gap-3 sm:grid-cols-2">
                  {(RULE_FIELDS[rule.key] ?? []).map((field) => (
                    <div key={field.key}>
                      <Label className="text-xs">{ui(field.label)}</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <Input className="nums" inputMode="decimal" disabled={!cfg.enabled} value={cfg[field.key] ?? ''} onChange={(e) => updateRule(rule.key, { [field.key]: e.target.value } as Partial<RuleConfig>)} />
                        <span className="shrink-0 text-xs text-muted-foreground">{ui(field.unit)}</span>
                      </div>
                    </div>
                  ))}
                </div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
