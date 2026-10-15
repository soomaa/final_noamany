import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { isNotImplemented } from '@/lib/api-hooks';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface InsuranceCatalogItem {
  id: number;
  title?: string | null;
}

interface InsuranceRateRow {
  id?: number;
  settingId?: number | null;
  settingTitle?: string | null;
  empAverage?: string | null;
  societyAverage?: string | null;
  nationalityType?: number;
}

interface InsurancePayload {
  saudi: InsuranceRateRow[];
  nonSaudi: InsuranceRateRow[];
  catalog: InsuranceCatalogItem[];
}

type NationalityType = 0 | 1;

interface RateDraft {
  empAverage: string;
  societyAverage: string;
}

function emptyRates(): Record<NationalityType, Record<number, RateDraft>> {
  return { 0: {}, 1: {} };
}

function indexRows(rows: InsuranceRateRow[] | undefined): Record<number, RateDraft> {
  const out: Record<number, RateDraft> = {};
  for (const row of rows ?? []) {
    if (row.settingId == null) continue;
    out[row.settingId] = {
      empAverage: row.empAverage ?? '0',
      societyAverage: row.societyAverage ?? '0',
    };
  }
  return out;
}

export function InsuranceSettingsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canUpdate = can('admin.insurance:update');
  const [tab, setTab] = useState<string>('0');
  const [rates, setRates] = useState(emptyRates);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['settings/insurance'],
    queryFn: async () => {
      const { data: payload } = await api.get<InsurancePayload>('/settings/insurance');
      return payload;
    },
    retry: false,
  });

  const components = useMemo(() => {
    const byId = new Map<number, string>();
    for (const item of data?.catalog ?? []) {
      byId.set(item.id, item.title ?? `—`);
    }
    for (const row of [...(data?.saudi ?? []), ...(data?.nonSaudi ?? [])]) {
      if (row.settingId != null && !byId.has(row.settingId)) {
        byId.set(row.settingId, row.settingTitle ?? String(row.settingId));
      }
    }
    return [...byId.entries()].map(([id, title]) => ({ id, title }));
  }, [data]);

  useEffect(() => {
    if (!data) return;
    setRates({
      0: indexRows(data.saudi),
      1: indexRows(data.nonSaudi),
    });
  }, [data]);

  const nationality = (Number(tab) === 1 ? 1 : 0) as NationalityType;

  const patchRate = (settingId: number, field: keyof RateDraft, value: string) => {
    setRates((current) => ({
      ...current,
      [nationality]: {
        ...current[nationality],
        [settingId]: {
          empAverage: current[nationality][settingId]?.empAverage ?? '0',
          societyAverage: current[nationality][settingId]?.societyAverage ?? '0',
          [field]: value,
        },
      },
    }));
  };

  const save = async () => {
    if (!canUpdate) return;
    setSaving(true);
    try {
      await api.put('/settings/insurance', {
        nationalityType: nationality,
        items: components.map((item) => ({
          settingId: item.id,
          empAverage: rates[nationality][item.id]?.empAverage ?? '0',
          societyAverage: rates[nationality][item.id]?.societyAverage ?? '0',
        })),
      });
      toast.success(ui('تم حفظ نسب التأمين'));
      await refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('إعدادات التأمينات')} />
        <NotImplementedState title={ui('إعدادات التأمينات — قيد الإعداد على الخادم')} />
      </div>
    );
  }

  const renderTable = (type: NationalityType) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-start text-muted-foreground">
            <th className="pb-2 font-medium">{ui('م')}</th>
            <th className="pb-2 font-medium">{ui('بند التأمين')}</th>
            <th className="pb-2 font-medium">{ui('نسبة الموظف')}</th>
            <th className="pb-2 font-medium">{ui('نسبة المنشأة')}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-muted-foreground">{ui('جارٍ التحميل…')}</td>
            </tr>
          ) : !components.length ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-muted-foreground">{ui('لا توجد بنود تأمين في الكتالوج')}</td>
            </tr>
          ) : (
            components.map((item, index) => {
              const draft = rates[type][item.id] ?? { empAverage: '0', societyAverage: '0' };
              return (
                <tr key={`${type}-${item.id}`} className="border-b last:border-0">
                  <td className="py-2 nums align-middle">{toArabicDigits(index + 1)}</td>
                  <td className="py-2 align-middle">{item.title}</td>
                  <td className="py-2 align-middle">
                    <Label className="sr-only">{ui('نسبة الموظف')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="nums max-w-[140px]"
                      disabled={!canUpdate}
                      value={draft.empAverage}
                      onChange={(event) => patchRate(item.id, 'empAverage', event.target.value)}
                    />
                  </td>
                  <td className="py-2 align-middle">
                    <Label className="sr-only">{ui('نسبة المنشأة')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="nums max-w-[140px]"
                      disabled={!canUpdate}
                      value={draft.societyAverage}
                      onChange={(event) => patchRate(item.id, 'societyAverage', event.target.value)}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('إعدادات التأمينات')}
        description={ui('نسب التأمينات الاجتماعية للسعوديين وغير السعوديين حسب بنود التغطية')}
        actions={
          canUpdate ? (
            <Button
              permissionResource="admin.insurance"
              permissionAction="update"
              variant="brand"
              size="sm"
              disabled={saving || isLoading}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ')}
            </Button>
          ) : null
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {ui('تعذّر تحميل إعدادات التأمينات')}
            <div className="mt-3">
              <Button permissionAction={null} variant="outline" size="sm" onClick={() => void refetch()}>
                {ui('إعادة المحاولة')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-5" />
              {ui('نسب التأمين')}
            </CardTitle>
            <CardDescription>
              {ui('الحفظ يستبدل نسب الجنسية الحالية بالكامل (موظف / منشأة) حسب الكتالوج.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="0">{ui('سعودي')}</TabsTrigger>
                <TabsTrigger value="1">{ui('غير سعودي')}</TabsTrigger>
              </TabsList>
              <TabsContent value="0" className="mt-4">
                {renderTable(0)}
              </TabsContent>
              <TabsContent value="1" className="mt-4">
                {renderTable(1)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
