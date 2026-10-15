import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DoorOpen, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';

interface ReceptionGate {
  id: number;
  name: string;
  branchId: number;
  status: string;
  isActive: boolean;
}

export function ReceptionGateControl({ branchId }: { branchId?: number | null }) {
  const { can } = usePermission();
  const { locale } = useLocale();
  const t = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const allowed = can('club.reception:create') || can('club.gate_access:execute');
  const busy = useRef(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ gateId: number; commandId: string } | null>(null);
  const gates = useQuery({
    queryKey: ['reception-gates'],
    enabled: allowed,
    queryFn: () => api.get<ReceptionGate[]>('/gate-access/reception/controllers').then((r) => r.data),
    refetchInterval: 15000,
    retry: false,
  });
  const open = useMutation({
    mutationFn: (gateId: number) =>
      api.post<{ commandId: string }>(`/gate-access/reception/controllers/${gateId}/open`),
    onSuccess: ({ data }, gateId) => {
      setPending({ gateId, commandId: data.commandId });
      setMessage(t('تم إرسال الطلب؛ ننتظر تأكيد الكنترول…', 'Request sent; awaiting controller confirmation…'));
    },
    onError: (error) => {
      busy.current = false;
      const text = apiError(error);
      setMessage(text);
      toast.error(text);
    },
  });
  const command = useQuery({
    queryKey: ['reception-gate-command', pending],
    enabled: pending !== null,
    queryFn: () =>
      api
        .get<{ status: string }>(
          `/gate-access/reception/controllers/${pending!.gateId}/commands/${pending!.commandId}`,
        )
        .then((r) => r.data),
    refetchInterval: pending ? 1000 : false,
    retry: false,
  });
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setMessage(
        t(
          'لم يصل تأكيد خلال ٢٠ ثانية؛ تحققي من البوابة قبل إعادة الطلب.',
          'No confirmation within 20 seconds; check the gate before retrying.',
        ),
      );
      setPending(null);
      busy.current = false;
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [pending, locale]);
  useEffect(() => {
    if (!pending) return;
    const status = command.data?.status;
    if (status !== 'completed' && status !== 'failed' && !command.isError) return;
    setMessage(
      status === 'completed'
        ? t('الكنترول أكد أمر الفتح؛ تحققي من حركة البوابة.', 'Controller confirmed the opening command; verify gate movement.')
        : t('تعذر تأكيد الفتح؛ تحققي من البوابة قبل إعادة الطلب.', 'Opening could not be confirmed; check the gate before retrying.'),
    );
    setPending(null);
    busy.current = false;
  }, [command.data, command.isError, pending, locale]);
  if (!allowed) return null;
  const visible = (gates.data ?? []).filter((g) => g.isActive && branchId && g.branchId === branchId);
  return (
    <section
      aria-label={t('فتح البوابة', 'Open gate')}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <span className="text-sm font-medium">{t('البوابة', 'Gate')}</span>
      {!branchId ? (
        <span className="text-sm text-muted-foreground">
          {t('اختاري فرع الاستقبال لفتح بوابته.', 'Select the reception branch to open its gate.')}
        </span>
      ) : gates.isPending ? (
        <span role="status" className="text-sm">
          {t('جارٍ تحميل البوابة…', 'Loading gate…')}
        </span>
      ) : gates.isError ? (
        <Button className="min-h-11" variant="outline" permissionAction={null} onClick={() => void gates.refetch()}>
          <RefreshCw />
          {t('تعذر الاتصال — إعادة المحاولة', 'Connection failed — retry')}
        </Button>
      ) : !visible.length ? (
        <span className="text-sm text-muted-foreground">
          {t('لا توجد بوابة مفعّلة لهذا الفرع.', 'No active gate for this branch.')}
        </span>
      ) : (
        visible.map((g) => (
          <Button
            key={g.id}
            className="min-h-11 h-auto whitespace-normal py-3"
            permissionAction={null}
            disabled={g.status !== 'online' || open.isPending || pending !== null}
            onClick={() => {
              if (busy.current) return;
              busy.current = true;
              setMessage('');
              open.mutate(g.id);
            }}
          >
            <DoorOpen />
            {g.status !== 'online'
              ? t('البوابة غير متصلة', 'Gate offline')
              : pending?.gateId === g.id || (open.isPending && open.variables === g.id)
                ? t('جارٍ تأكيد الفتح…', 'Confirming opening…')
                : t('فتح البوابة', 'Open gate')}
            {visible.length > 1 ? ` — ${g.name}` : ''}
          </Button>
        ))
      )}
      <p role="status" aria-live="polite" className="basis-full text-sm">
        {message}
      </p>
    </section>
  );
}
