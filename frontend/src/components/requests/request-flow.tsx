import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CornerUpLeft, Pencil, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { DateTimeText } from '@/components/common/formatters';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

/**
 * One request card for leaves, permissions and overtime requests (web): status chip, fields,
 * timeline (who / action / comment / when) and the actions — موافقة، رفض، إرجاع بتعليق — or,
 * for a request returned to me, edit + resubmit. Backed by /requests/flow/:kind/:id.
 */

export type FlowKind = 'leave' | 'permission' | 'overtime';
export type FlowStatus =
  | 'pending_manager'
  | 'pending_hr'
  | 'pending_dept'
  | 'pending_gm'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface FlowTimelineEntry {
  at: string;
  action: string;
  actionLabel: string;
  stage?: string | null;
  stageLabel?: string | null;
  byName?: string | null;
  toName?: string | null;
  comment?: string | null;
  override?: boolean;
}

export interface FlowDetail {
  kind: FlowKind;
  id: number;
  employeeName?: string | null;
  title?: string | null;
  createdAt?: string | null;
  currentTo?: string | null;
  flowStatus: FlowStatus;
  flowStatusLabel: string;
  returned: boolean;
  returnComment?: string | null;
  returnedBy?: string | null;
  canAction: boolean;
  canReturn: boolean;
  canResubmit: boolean;
  canPartial?: boolean;
  override?: boolean;
  fields: { key: string; label: string; value: string | null }[];
  editable: Record<string, string | number | null | undefined>;
  timeline: FlowTimelineEntry[];
}

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  pending_manager: uiStatic('بانتظار المدير'),
  pending_hr: uiStatic('بانتظار HR'),
  pending_dept: uiStatic('بانتظار مدير الإدارة'),
  pending_gm: uiStatic('بانتظار المدير العام'),
  returned: uiStatic('مرتجع'),
  approved: uiStatic('موافق'),
  rejected: uiStatic('مرفوض'),
  cancelled: uiStatic('ملغي'),
};

const CHIP_TONE: Record<FlowStatus, string> = {
  pending_manager: 'border-warning/30 bg-warning/15 text-warning',
  pending_hr: 'border-primary/30 bg-primary/15 text-primary',
  pending_dept: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  pending_gm: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  returned: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  approved: 'border-success/30 bg-success/15 text-success',
  rejected: 'border-destructive/30 bg-destructive/15 text-destructive',
  cancelled: 'border-border bg-muted text-muted-foreground',
};

export function FlowStatusChip({ status, label, className }: { status?: FlowStatus | null; label?: string | null; className?: string }) {
  const { ui } = useLocale();
  if (!status) return null;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', CHIP_TONE[status], className)}>
      {label ? ui(label) : FLOW_STATUS_LABEL[status]}
    </span>
  );
}

const ACTION_TONE: Record<string, string> = {
  submit: 'bg-primary',
  resubmit: 'bg-primary',
  accept: 'bg-success',
  recorded: 'bg-success',
  reject: 'bg-destructive',
  cancel: 'bg-muted-foreground',
  return: 'bg-orange-500',
  skip: 'bg-muted-foreground/50',
};

export function FlowTimeline({ entries }: { entries: FlowTimelineEntry[] }) {
  const { ui } = useLocale();
  if (!entries.length) return <p className="text-sm text-muted-foreground">{ui('لا توجد حركات مسجلة')}</p>;
  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => (
        <li key={index} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', ACTION_TONE[entry.action] ?? 'bg-muted-foreground')} />
            {index < entries.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-sm font-medium">
              {ui(entry.actionLabel)}
              {entry.stageLabel ? <span className="text-muted-foreground"> — {ui(entry.stageLabel)}</span> : null}
              {entry.override ? <span className="ms-1 rounded bg-warning/15 px-1 text-[10px] text-warning">{ui('تجاوز')}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              <DateTimeText value={entry.at} />
              {entry.byName ? ` — ${entry.byName}` : ''}
              {entry.toName ? ` ← ${entry.toName}` : ''}
            </p>
            {entry.comment && (
              <p className={cn('mt-1 whitespace-pre-wrap rounded-md px-2 py-1 text-sm', entry.action === 'return' ? 'bg-orange-500/10' : 'bg-muted/50')}>
                {entry.comment}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

type Decision = 'accept' | 'reject' | 'return';

const EDIT_FIELDS: Record<FlowKind, { key: string; label: string; type: 'date' | 'time' | 'number' | 'text' }[]> = {
  leave: [
    { key: 'startDate', label: uiStatic('من'), type: 'date' },
    { key: 'endDate', label: uiStatic('إلى'), type: 'date' },
    { key: 'returnToWorkDate', label: uiStatic('تاريخ المباشرة'), type: 'date' },
    { key: 'reason', label: uiStatic('السبب'), type: 'text' },
  ],
  permission: [
    { key: 'eznDate', label: uiStatic('التاريخ'), type: 'date' },
    { key: 'fromHour', label: uiStatic('من'), type: 'time' },
    { key: 'toHour', label: uiStatic('إلى'), type: 'time' },
    { key: 'reason', label: uiStatic('السبب'), type: 'text' },
  ],
  overtime: [
    { key: 'date', label: uiStatic('التاريخ'), type: 'date' },
    { key: 'hours', label: uiStatic('عدد الساعات'), type: 'number' },
    { key: 'reason', label: uiStatic('السبب'), type: 'text' },
  ],
};

/** The request card itself (used inside the dialog and by pages). */
export function RequestFlowCard({ kind, id, onChanged }: { kind: FlowKind; id: number; onChanged?: () => void }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requests', 'flow', kind, id],
    queryFn: async () => (await api.get<FlowDetail>(`/requests/flow/${kind}/${id}`)).data,
  });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState('');
  const [partial, setPartial] = useState({ startDate: '', endDate: '' });
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDecision(null);
    setComment('');
    setEditing(false);
  }, [kind, id]);

  useEffect(() => {
    if (!data) return;
    const values: Record<string, string> = {};
    for (const f of EDIT_FIELDS[data.kind]) values[f.key] = data.editable?.[f.key] != null ? String(data.editable[f.key]) : '';
    setEdit(values);
    setPartial({ startDate: String(data.editable?.startDate ?? ''), endDate: String(data.editable?.endDate ?? '') });
  }, [data]);

  const done = (message: string) => {
    toast.success(message);
    setDecision(null);
    setComment('');
    setEditing(false);
    ['requests', 'leaves', 'permissions', 'overtime-requests'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    void refetch();
    onChanged?.();
  };

  const decide = async () => {
    if (!decision) return;
    if (decision === 'return' && comment.trim().length < 3) {
      toast.error(ui('اكتب سبب الإرجاع للتعديل'));
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string | undefined> = { action: decision, comment: comment.trim() || undefined };
      if (decision === 'accept' && data?.canPartial && data.editable) {
        if (partial.startDate && partial.startDate !== data.editable.startDate) body.startDate = partial.startDate;
        if (partial.endDate && partial.endDate !== data.editable.endDate) body.endDate = partial.endDate;
        if (body.startDate || body.endDate) {
          body.startDate ??= String(data.editable.startDate ?? '');
          body.endDate ??= String(data.editable.endDate ?? '');
        }
      }
      const { data: result } = await api.post<{ warning?: string; message?: string }>(`/requests/flow/${kind}/${id}/action`, body);
      if (result?.warning) toast.warning(result.warning, { duration: 10_000 });
      done(decision === 'accept' ? ui('تمت الموافقة') : decision === 'reject' ? ui('تم الرفض') : ui('تم إرجاع الطلب للتعديل'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const resubmit = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const body: Record<string, string | number | undefined> = { comment: comment.trim() || undefined };
      for (const f of EDIT_FIELDS[data.kind]) {
        const value = edit[f.key];
        const original = data.editable?.[f.key] != null ? String(data.editable[f.key]) : '';
        if (value !== undefined && value !== original && value !== '') body[f.key] = f.type === 'number' ? Number(value) : value;
      }
      await api.post(`/requests/flow/${kind}/${id}/resubmit`, body);
      done(ui('تم التعديل وإعادة الإرسال'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
  if (isError || !data) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{ui('تعذر تحميل الطلب')}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button>
      </div>
    );
  }

  const editFields = EDIT_FIELDS[data.kind].filter((f) => !(data.kind === 'overtime' && f.key === 'hours' && data.editable?.kind === 'shift'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FlowStatusChip status={data.flowStatus} label={data.flowStatusLabel} />
        <span className="text-sm font-semibold">{data.title}</span>
        {data.employeeName && <span className="text-sm text-muted-foreground">— {data.employeeName}</span>}
        {data.currentTo && !['approved', 'rejected', 'cancelled'].includes(data.flowStatus) && (
          <span className="text-xs text-muted-foreground">({ui('الطلب الآن عند')} {data.currentTo})</span>
        )}
      </div>

      {data.returned && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-sm">
          <p className="font-medium">{ui('مرتجع للتعديل')}{data.returnedBy ? ` — ${data.returnedBy}` : ''}</p>
          {data.returnComment && <p className="mt-1 whitespace-pre-wrap">{data.returnComment}</p>}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {data.fields.filter((f) => f.value).map((f) => (
          <div key={f.key} className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{ui(f.label)}</p>
            <p className="mt-0.5 text-sm font-medium">{f.key === 'hours' || f.key === 'days' || f.key === 'minutes' ? toArabicDigits(f.value ?? '') : f.value}</p>
          </div>
        ))}
      </div>

      {data.canAction && (
        <div className="space-y-3 rounded-lg border p-3">
          {data.override && (
            <p className="text-xs text-warning">{ui('الطلب مش محول ليك — قرارك هيتسجل كتجاوز من الموارد البشرية')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={decision === 'accept' ? 'brand' : 'outline'} onClick={() => setDecision('accept')}>
              <Check className="size-4 text-success" />{ui('موافقة')}
            </Button>
            <Button size="sm" variant={decision === 'reject' ? 'destructive' : 'outline'} onClick={() => setDecision('reject')}>
              <X className="size-4" />{ui('رفض')}
            </Button>
            {data.canReturn && (
              <Button size="sm" variant={decision === 'return' ? 'secondary' : 'outline'} onClick={() => setDecision('return')}>
                <CornerUpLeft className="size-4 text-orange-600" />{ui('إرجاع بتعليق')}
              </Button>
            )}
          </div>
          {decision && (
            <div className="space-y-2">
              {decision === 'accept' && data.canPartial && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><Label>{ui('اعتماد من')}</Label><Input type="date" value={partial.startDate} onChange={(e) => setPartial((p) => ({ ...p, startDate: e.target.value }))} /></div>
                  <div><Label>{ui('إلى')}</Label><Input type="date" value={partial.endDate} onChange={(e) => setPartial((p) => ({ ...p, endDate: e.target.value }))} /></div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{ui('غير التواريخ للاعتماد الجزئي داخل الفترة المطلوبة')}</p>
                </div>
              )}
              <Label>{decision === 'return' ? ui('سبب الإرجاع (هيظهر لمقدم الطلب)') : ui('تعليق (اختياري)')}</Label>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision === 'return' ? ui('مثال: البصمة بتأكد ساعتين بس، عدل العدد') : ''} />
              {decision === 'accept' && data.kind === 'overtime' && (
                <p className="text-xs text-muted-foreground">{ui('عند الموافقة النهائية يتسجل في الحضور، والمرتب بيصرف المؤكد بالبصمة بس.')}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} variant={decision === 'reject' ? 'destructive' : 'brand'} onClick={() => void decide()}>
                  {decision === 'accept' ? ui('تأكيد الموافقة') : decision === 'reject' ? ui('تأكيد الرفض') : ui('إرجاع للتعديل')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecision(null)}>{ui('إلغاء')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {data.canResubmit && (
        <div className="space-y-3 rounded-lg border border-orange-500/40 p-3">
          {!editing ? (
            <Button size="sm" variant="brand" onClick={() => setEditing(true)}><Pencil className="size-4" />{ui('تعديل وإعادة إرسال')}</Button>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {editFields.map((f) => (
                  <div key={f.key} className={f.type === 'text' ? 'sm:col-span-2' : ''}>
                    <Label>{ui(f.label)}</Label>
                    {f.type === 'text'
                      ? <Textarea rows={2} value={edit[f.key] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [f.key]: e.target.value }))} />
                      : <Input type={f.type} min={f.type === 'number' ? 1 : undefined} max={f.type === 'number' ? 12 : undefined} value={edit[f.key] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [f.key]: e.target.value }))} />}
                  </div>
                ))}
              </div>
              <Label>{ui('رد على التعليق (اختياري)')}</Label>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" variant="brand" disabled={busy} onClick={() => void resubmit()}><Send className="size-4" />{ui('إعادة الإرسال')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{ui('إلغاء')}</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">{ui('مسار الطلب')}</p>
        <FlowTimeline entries={data.timeline} />
      </div>
    </div>
  );
}

export function RequestFlowDialog({
  target,
  onOpenChange,
  onChanged,
}: {
  target: { kind: FlowKind; id: number } | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const { ui } = useLocale();
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ui('تفاصيل الطلب')}</DialogTitle>
          <DialogDescription>{ui('الحالة، المسار، والتعليقات')}</DialogDescription>
        </DialogHeader>
        {target && <RequestFlowCard kind={target.kind} id={target.id} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  );
}
