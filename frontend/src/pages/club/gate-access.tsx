import { formatDisplayNumber } from '@/lib/number-display';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Download,
  Pencil,
  CheckCircle2,
  Clipboard,
  DoorOpen,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { buildGateSetup, GATE_MODELS, validateGateForm } from './gate-setup';

interface GateController {
  id: number;
  name: string;
  branchId: number;
  branchName: string | null;
  model: string;
  staticIp: string;
  port: number;
  entryDoorNo: number;
  exitDoorNo: number;
  tokenPrefix: string;
  status: 'online' | 'offline' | 'disabled' | 'controller_offline' | 'error';
  isActive: boolean;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  firmwareVersion: string | null;
  serialNumber: string | null;
  connectionMode?: 'agent' | 'push';
  pushAllowedIp?: string | null;
  agentVersion: string | null;
  lastError: string | null;
}

interface GateEvent {
  id: string;
  controllerName: string;
  memberName: string | null;
  memberCode: string | null;
  credentialNo: string | null;
  direction: 'entry' | 'exit' | 'unknown';
  eventTime: string;
  accepted: boolean;
  reasonMessage: string | null;
}

interface GateEventsResponse {
  data: GateEvent[];
  total: number;
}

const EMPTY_FORM = {
  name: uiStatic('بوابة الجيم الرئيسية'),
  branchId: '',
  staticIp: '',
  port: '4370',
  model: '',
  entryDoorNo: '1',
  exitDoorNo: '0',
  connectionMode: 'agent' as 'agent' | 'push',
  serialNumber: '',
  pushAllowedIp: '',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function statusView(status: GateController['status']) {
  if (status === 'online') {
    return { label: uiStatic('الكنترول متصل'), variant: 'success' as const, icon: CheckCircle2 };
  }
  if (status === 'disabled') {
    return { label: uiStatic('معطل'), variant: 'secondary' as const, icon: WifiOff };
  }
  if (status === 'controller_offline') {
    return { label: uiStatic('الكمبيوتر متصل والكنترول مفصول'), variant: 'warning' as const, icon: WifiOff };
  }
  return { label: uiStatic('غير متصل'), variant: 'destructive' as const, icon: WifiOff };
}

export function GateAccessPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canConfigure = can('club.gate_access:configure');
  const canExecute = can('club.gate_access:execute');
  const queryClient = useQueryClient();
  const { data: branches = [] } = useBranches();
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [agentToken, setAgentToken] = useState('');
  const [editing, setEditing] = useState<GateController | null>(null);
  const [setupController, setSetupController] = useState<GateController | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const controllers = useQuery({
    queryKey: ['gate-access', 'controllers'],
    queryFn: () => api.get<GateController[]>('/gate-access/controllers').then((response) => response.data),
    refetchInterval: 15_000,
  });
  const events = useQuery({
    queryKey: ['gate-access', 'events'],
    queryFn: () =>
      api.get<GateEventsResponse>('/gate-access/events', { params: { pageSize: 25 } })
        .then((response) => response.data),
    refetchInterval: 5_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['gate-access'] });
  };

  const createController = useMutation({
    mutationFn: () => {
      if (!canConfigure) throw new Error(ui('لا تملك صلاحية إعداد البوابة'));
      const invalid = validateGateForm(form);
      if (invalid) throw new Error(ui(invalid));
      const payload = {
        name: form.name.trim(),
        branchId: Number(form.branchId),
        staticIp: form.staticIp.trim(),
        port: Number(form.port),
        model: form.model,
        entryDoorNo: Number(form.entryDoorNo),
        exitDoorNo: Number(form.exitDoorNo),
        connectionMode: form.connectionMode,
        ...(form.connectionMode === 'push'
          ? {
              serialNumber: form.serialNumber.trim(),
              pushAllowedIp: form.pushAllowedIp.trim(),
              staticIp: form.staticIp.trim() || undefined,
            }
          : {}),
      };
      if (editing) return api.patch<GateController>(`/gate-access/controllers/${editing.id}`, payload)
        .then(({ data }) => ({ data: { controller: data, agentToken: '' } }));
      return api.post<{ controller: GateController; agentToken: string }>('/gate-access/controllers', payload);
    },
    onSuccess: ({ data }) => {
      setAgentToken(data.agentToken);
      setSetupController(data.controller);
      setCreateOpen(false);
      setTokenOpen(Boolean(data.agentToken));
      setEditing(null);
      setForm(EMPTY_FORM);
      refresh();
      toast.success(ui('تم حفظ إعداد الكنترول'));
    },
    onError: (error) => toast.error(apiError(error, error instanceof Error ? error.message : undefined)),
  });

  const openDoor = useMutation({
    mutationFn: ({ controllerId, doorNo }: { controllerId: number; doorNo: number }) => {
      if (!canExecute) throw new Error(ui('لا تملك صلاحية فتح البوابة'));
      return api.post(`/gate-access/controllers/${controllerId}/open`, { doorNo, seconds: 1 });
    },
    onSuccess: () => toast.success(ui('تم إرسال أمر الفتح للبوابة')),
    onError: (error) => toast.error(apiError(error)),
  });

  const toggleController = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!canConfigure) throw new Error(ui('لا تملك صلاحية إعداد البوابة'));
      return api.patch(`/gate-access/controllers/${id}`, { isActive });
    },
    onSuccess: () => {
      refresh();
      toast.success(ui('تم تحديث حالة الكنترول'));
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const rotateToken = async (controller: GateController) => {
    if (!canConfigure) return;
    const approved = await confirm({
      title: ui('إنشاء Agent Token جديد'),
      description: ui('سيتوقف الـAgent الحالي حتى يتم وضع الـToken الجديد في ملف الإعدادات. هل تريدين المتابعة؟'),
      confirmLabel: ui('إنشاء Token جديد'),
      variant: 'destructive',
    });
    if (!approved) return;
    try {
      const { data } = await api.post<{ agentToken: string }>(
        `/gate-access/controllers/${controller.id}/rotate-token`,
      );
      setAgentToken(data.agentToken);
      setSetupController(controller);
      setTokenOpen(true);
      refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(agentToken);
      toast.success(ui('تم نسخ الـToken'));
    } catch { toast.error(ui('تعذر النسخ؛ حمّلي ملف الإعداد بدلًا من النسخ اليدوي')); }
  };

  const downloadSetup = () => {
    if (!setupController || !agentToken) return;
    const blob = new Blob([JSON.stringify(buildGateSetup(setupController, agentToken, window.location.origin), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'one80-gate-setup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const editController = (controller: GateController) => {
    setEditing(controller);
    setForm({ name: controller.name, branchId: String(controller.branchId), model: controller.model,
      staticIp: controller.staticIp, port: String(controller.port), entryDoorNo: String(controller.entryDoorNo), exitDoorNo: String(controller.exitDoorNo),
      connectionMode: controller.connectionMode ?? 'agent', serialNumber: controller.serialNumber ?? '', pushAllowedIp: controller.pushAllowedIp ?? '' });
    setCreateOpen(true);
  };
  const rows = controllers.data ?? [];
  const formError = validateGateForm(form);
  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('التحكم في بوابة الجيم')}
        description={ui('تتم مراجعة العضوية عند مسح QR، ثم إرسال أمر الفتح وتسجيل الحضور. يجب أن يظل برنامج الربط والإنترنت يعملان.')}
        actions={(
          <>
            {canConfigure && <Button asChild variant="outline" permissionAction={null}>
              <a href="/downloads/ONE80-GateAgent-Windows-1.1.0.zip" download><Download className="me-2 size-4" />{ui('برنامج الربط لـWindows')}</a>
            </Button>}
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="me-2 size-4" />
              {ui('تحديث')}
            </Button>
            {canConfigure && <Button permissionAction="configure" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setCreateOpen(true); }}>
              <Plus className="me-2 size-4" />
              {ui('إضافة كنترول')}
            </Button>}
          </>
        )}
      />

      {controllers.isError && <p role="alert" className="text-sm text-destructive">{apiError(controllers.error)}</p>}
      {controllers.isLoading && <p role="status">{ui('جارٍ تحميل البوابات...')}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((controller) => {
          const state = statusView(controller.status);
          const StatusIcon = state.icon;
          return (
            <Card key={controller.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="break-words">{controller.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {controller.branchName ?? ui('بدون اسم فرع')} · {controller.model}
                    </CardDescription>
                  </div>
                  <Badge variant={state.variant}>
                    <StatusIcon className="size-3.5" />
                    {ui(state.label)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{ui('IP الكنترول')}</dt>
                  <dd className="text-end font-mono" dir="ltr">{controller.staticIp}:{controller.port}</dd>
                  <dt className="text-muted-foreground">{ui('آخر اتصال')}</dt>
                  <dd className="text-end">{formatDateTime(controller.lastSeenAt)}</dd>
                  <dt className="text-muted-foreground">{ui('نسخة الجهاز')}</dt>
                  <dd className="break-all text-end">{controller.firmwareVersion ?? '—'}</dd>
                  <dt className="text-muted-foreground">{ui('نسخة الـAgent')}</dt>
                  <dd className="text-end">{controller.agentVersion ?? '—'}</dd>
                </dl>
                {!controller.lastSeenAt && <p className="text-sm text-muted-foreground">{ui('لم يتصل برنامج الربط بعد. ثبّتي حزمة Windows باستخدام ملف الإعداد على كمبيوتر الجيم.')}</p>}
                <p className="text-sm text-muted-foreground">{ui('رقم الكنترول')}: <span dir="ltr">{controller.id}</span> · {ui('دخول')}: {formatDisplayNumber(controller.entryDoorNo)} · {ui('خروج')}: {controller.exitDoorNo || ui('غير مستخدم')}</p>
                {controller.serialNumber && <p className="break-all text-sm" dir="ltr">SN: {controller.serialNumber}</p>}
                {controller.lastError && (
                  <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                    {controller.lastError}
                  </p>
                )}
                {canExecute && <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={controller.status !== 'online' || openDoor.isPending}
                    onClick={() => openDoor.mutate({
                      controllerId: controller.id,
                      doorNo: controller.entryDoorNo,
                    })}
                  >
                    <DoorOpen className="me-2 size-4" />
                    {ui('فتح الدخول')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={controller.exitDoorNo === 0 || controller.status !== 'online' || openDoor.isPending}
                    onClick={() => openDoor.mutate({
                      controllerId: controller.id,
                      doorNo: controller.exitDoorNo,
                    })}
                  >
                    <DoorOpen className="me-2 size-4" />
                    {ui('فتح الخروج')}
                  </Button>
                </div>}
                {canConfigure && <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button permissionAction="configure" size="sm" variant="outline" onClick={() => editController(controller)}><Pencil className="me-2 size-4" />{ui('تعديل الإعدادات')}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    permissionAction="configure"
                    onClick={() => void rotateToken(controller)}
                  >
                    <KeyRound className="me-2 size-4" />
                    {ui('Token جديد')}
                  </Button>
                  <Button
                    size="sm"
                    permissionAction="configure"
                    disabled={toggleController.isPending}
                    variant={controller.isActive ? 'destructive' : 'outline'}
                    onClick={() => toggleController.mutate({
                      id: controller.id,
                      isActive: !controller.isActive,
                    })}
                  >
                    {controller.isActive ? ui('تعطيل') : ui('تفعيل')}
                  </Button>
                </div>}
              </CardContent>
            </Card>
          );
        })}
        {!controllers.isLoading && !controllers.isError && rows.length === 0 && (
          <Card className="xl:col-span-2">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Cable className="size-10 text-muted-foreground" />
              <h2 className="font-semibold">{ui('لم تتم إضافة الكنترول بعد')}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                {ui('أضيفي الكنترول بالموديل وعنوان الشبكة الصحيحين، ثم حمّلي ملف إعداد برنامج الربط.')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ui('آخر عمليات البوابة')}</CardTitle>
          <CardDescription>
            {ui('الدخول والخروج والعمليات المرفوضة تصل مباشرة من الكنترول.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.isError && <p role="alert" className="mb-3 text-sm text-destructive">{apiError(events.error)}</p>}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{ui('الوقت')}</th>
                  <th className="p-3 text-start">{ui('العضو')}</th>
                  <th className="p-3 text-start">{ui('الاتجاه')}</th>
                  <th className="p-3 text-start">{ui('الكنترول')}</th>
                  <th className="p-3 text-start">{ui('النتيجة')}</th>
                  <th className="p-3 text-start">{ui('ملاحظة')}</th>
                </tr>
              </thead>
              <tbody>
                {(events.data?.data ?? []).map((event) => (
                  <tr key={event.id} className="border-t">
                    <td className="whitespace-nowrap p-3">{formatDateTime(event.eventTime)}</td>
                    <td className="p-3">
                      <div className="font-medium">{event.memberName ?? ui('رمز غير معروف')}</div>
                      <div className="text-xs text-muted-foreground">{event.memberCode ?? event.credentialNo ?? '—'}</div>
                    </td>
                    <td className="p-3">
                      {event.direction === 'entry' ? ui('دخول') : event.direction === 'exit' ? ui('خروج') : '—'}
                    </td>
                    <td className="p-3">{event.controllerName}</td>
                    <td className="p-3">
                      <Badge variant={event.accepted ? 'success' : 'destructive'}>
                        {event.accepted ? ui('مسموح') : ui('مرفوض')}
                      </Badge>
                    </td>
                    <td className="max-w-[280px] truncate p-3 text-muted-foreground">
                      {event.reasonMessage ?? '—'}
                    </td>
                  </tr>
                ))}
                {!events.isLoading && !events.isError && (events.data?.data.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {ui('لا توجد عمليات بوابة حتى الآن')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui(editing ? 'تعديل إعدادات الكنترول' : 'إضافة كنترول')}</DialogTitle>
            <DialogDescription>
              {ui('اختاري موديل لوحة التحكم المتصلة بقارئ QR50BE. الاتصال الحالي يتطلب تفعيل Pull SDK على الكنترول.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gate-name">{ui('اسم البوابة')}</Label>
              <Input id="gate-name" maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-branch">{ui('الفرع')}</Label>
              <Select value={form.branchId} onValueChange={(branchId) => setForm({ ...form, branchId })}>
                <SelectTrigger id="gate-branch"><SelectValue placeholder={ui('اختاري الفرع')} /></SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name ?? `#${branch.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-connection">{ui('طريقة الربط')}</Label>
              <Select
                value={form.connectionMode}
                onValueChange={(connectionMode) => setForm({ ...form, connectionMode: connectionMode as 'agent' | 'push' })}
              >
                <SelectTrigger id="gate-connection"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">{ui('برنامج الويندوز')}</SelectItem>
                  <SelectItem value="push">{ui('اتصال مباشر من الكنترول')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.connectionMode === 'push' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="gate-serial">{ui('الرقم التسلسلي')}</Label>
                  <Input
                    dir="ltr"
                    id="gate-serial"
                    value={form.serialNumber}
                    onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gate-allowed-ip">{ui('IP المسموح')}</Label>
                  <Input
                    dir="ltr"
                    id="gate-allowed-ip"
                    placeholder="192.168.1.x"
                    value={form.pushAllowedIp}
                    onChange={(event) => setForm({ ...form, pushAllowedIp: event.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="gate-model">{ui('موديل الكنترول')}</Label>
              <Select value={form.model} onValueChange={(model) => setForm({ ...form, model, entryDoorNo: '1', exitDoorNo: '0' })}>
                <SelectTrigger id="gate-model"><SelectValue placeholder={ui('اختاري موديل الكنترول')} /></SelectTrigger>
                <SelectContent>{GATE_MODELS.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['entryDoorNo', 'exitDoorNo'] as const).map((field) => <div key={field} className="space-y-2">
                <Label htmlFor={field}>{ui(field === 'entryDoorNo' ? 'مخرج الدخول' : 'مخرج الخروج')}</Label>
                <Select value={form[field]} onValueChange={(value) => setForm({ ...form, [field]: value })}>
                  <SelectTrigger id={field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {field === 'exitDoorNo' && <SelectItem value="0">{ui('غير مستخدم')}</SelectItem>}
                    <SelectItem value="1">1</SelectItem>
                    {form.model !== 'INBIO160-PRO' && <SelectItem value="2">2</SelectItem>}
                  </SelectContent>
                </Select>
              </div>)}
            </div>
            {form.exitDoorNo === form.entryDoorNo && <p className="text-sm text-muted-foreground">{ui('نفس المخرج للدخول والخروج: يجب ضبط اتجاه القارئين على الكنترول لتسجيل الحضور بشكل صحيح.')}</p>}
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="space-y-2">
                <Label htmlFor="gate-ip">{ui('IP الكنترول')}</Label>
                <Input
                  dir="ltr"
                  id="gate-ip"
                  placeholder="192.168.1.x"
                  value={form.staticIp}
                  onChange={(event) => setForm({ ...form, staticIp: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gate-port">{ui('Port')}</Label>
                <Input id="gate-port" dir="ltr" inputMode="numeric" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} />
              </div>
            </div>
          </div>
          {formError && <p role="status" className="text-sm text-muted-foreground">{ui(formError)}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            {canConfigure && <Button permissionAction="configure"
              disabled={Boolean(formError) || createController.isPending}
              onClick={() => createController.mutate()}
            >
              {createController.isPending ? ui('جارٍ الحفظ...') : ui(editing ? 'حفظ التعديلات' : 'حفظ وتجهيز الربط')}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenOpen} onOpenChange={(open) => { setTokenOpen(open); if (!open) { setAgentToken(''); setSetupController(null); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success" />
              {ui('ملف إعداد برنامج الربط')}
            </DialogTitle>
            <DialogDescription>
              {ui('حمّلي الملف وضعيه بجوار برنامج التثبيت على كمبيوتر الجيم. يحتوي على مفتاح الربط الخاص بهذه البوابة ويظهر مرة واحدة.')}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{ui('رقم الكنترول')}: {setupController?.id} · {setupController?.model}</p>
          <details><summary className="cursor-pointer text-sm">{ui('عرض مفتاح الربط للنسخ اليدوي')}</summary>
          <div className="rounded-xl border bg-muted/30 p-4">
            <code className="block break-all text-sm" dir="ltr">{agentToken}</code>
          </div>
          </details>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copyToken()}>
              <Clipboard className="me-2 size-4" />
              {ui('نسخ الـToken')}
            </Button>
            <Button onClick={downloadSetup}><Download className="me-2 size-4" />{ui('تحميل ملف الإعداد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
