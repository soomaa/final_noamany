import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { ErrorState } from '@/components/common/states';
import { DEFAULT_ACCOUNT_KEYS, type AccountingSettings } from '@/types/accounting';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';

type PeriodRow = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

export function AccountingSettingsPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: ['accounting', 'settings'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountingSettings>('/accounting/settings');
      return d;
    },
  });

  const [form, setForm] = useState<AccountingSettings | null>(null);
  const [newYear, setNewYear] = useState(() => String(new Date().getFullYear() + 1));
  const [periodBusy, setPeriodBusy] = useState<number | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: AccountingSettings) => api.put('/accounting/settings', payload),
    onSuccess: () => {
      toast.success(ui('تم حفظ الإعدادات'));
      void refetch();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const { data: periods, refetch: refetchPeriods } = useQuery({
    queryKey: ['accounting', 'periods'],
    queryFn: async () => {
      const { data: d } = await api.get<PeriodRow[]>('/accounting/periods');
      return d;
    },
  });

  const invalidatePeriods = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounting', 'periods'] });
  };

  const createPeriod = async () => {
    const year = Number(newYear);
    if (!Number.isFinite(year) || year < 2000) {
      toast.error(ui('سنة غير صالحة'));
      return;
    }
    try {
      await api.post('/accounting/periods', { year });
      toast.success(ui('تم إنشاء الفترة'));
      void refetchPeriods();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const closePeriod = async (id: number) => {
    setPeriodBusy(id);
    try {
      await api.post(`/accounting/periods/${id}/close`);
      toast.success(ui('تم إقفال الفترة'));
      invalidatePeriods();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPeriodBusy(null);
    }
  };

  const reopenPeriod = async (id: number) => {
    setPeriodBusy(id);
    try {
      await api.post(`/accounting/periods/${id}/reopen`);
      toast.success(ui('تم إعادة فتح الفترة'));
      invalidatePeriods();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPeriodBusy(null);
    }
  };

  if (isError) {
    return (
      <AccountingPageShell title={ui('إعدادات المحاسبة')}>
        <ErrorState onRetry={() => void refetch()} />
      </AccountingPageShell>
    );
  }

  if (!form) {
    return (
      <AccountingPageShell title={ui('إعدادات المحاسبة')}>
        <p className="text-muted-foreground">{isLoading ? ui('جاري التحميل…') : ui('لا توجد إعدادات')}</p>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title={ui('إعدادات المحاسبة')}
      description={ui('العملة، السنة المالية، وربط الحسابات الافتراضية')}
      actions={
        <Button variant="brand" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
          <Save className="h-4 w-4" />
          {ui('حفظ')}
        </Button>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h3 className="font-medium">{ui('عام')}</h3>
          <div className="grid gap-1">
            <Label>{ui('بداية السنة المالية')}</Label>
            <Input
              className="nums"
              value={form.fiscalYearStart}
              onChange={(e) => setForm({ ...form, fiscalYearStart: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{ui('العملة')}</Label>
            <Input value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>{ui('رمز العملة')}</Label>
            <Input value={form.currencySymbol} onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })} />
          </div>
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h3 className="font-medium">{ui('الحسابات الافتراضية')}</h3>
          {DEFAULT_ACCOUNT_KEYS.map((key) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{key}</Label>
              <Input
                className="nums"
                value={form.defaultAccounts[key] ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultAccounts: { ...form.defaultAccounts, [key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <span className="font-medium">{ui('الفترات المحاسبية')}</span>
          <div className="flex items-end gap-2">
            <Input
              className="nums w-24"
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              placeholder={ui('السنة')}
            />
            <Button variant="outline" size="sm" onClick={() => void createPeriod()}>
              <Plus className="h-4 w-4" />
              {ui('فترة جديدة')}
            </Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-start">{ui('الاسم')}</th>
              <th className="p-3 text-start">{ui('من')}</th>
              <th className="p-3 text-start">{ui('إلى')}</th>
              <th className="p-3 text-start">{ui('الحالة')}</th>
              <th className="p-3 text-start">{ui('إجراءات')}</th>
            </tr>
          </thead>
          <tbody>
            {(periods ?? []).map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-3">{p.name}</td>
                <td className="p-3 nums">{p.startDate}</td>
                <td className="p-3 nums">{p.endDate}</td>
                <td className="p-3">{p.status}</td>
                <td className="p-3">
                  {p.status === 'open' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={periodBusy === p.id}
                      onClick={() => void closePeriod(p.id)}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {ui('إقفال')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={periodBusy === p.id}
                      onClick={() => void reopenPeriod(p.id)}
                    >
                      <LockOpen className="h-3.5 w-3.5" />
                      {ui('إعادة فتح')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccountingPageShell>
  );
}
