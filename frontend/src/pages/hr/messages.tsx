import type { ColumnDef } from '@tanstack/react-table';
import { Inbox, Send, Plus, Eye, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MultiSelect } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface MessageRow {
  id: number;
  title: string | null;
  subject: string | null;
  body: string | null;
  date: string | null;
  time: string | null;
  fromName: string | null;
  toName: string | null;
  seen: boolean;
  sendAll: boolean;
}

interface MessageDetail {
  id: number;
  title: string | null;
  subject: string | null;
  body: string | null;
  date: string | null;
  fromName: string | null;
  isSender: boolean;
  sendAll: boolean;
  recipients: { id: number; empName: string | null; seen: boolean }[];
}

const EMPTY_FORM = { title: '', subject: '', body: '', sendAll: false };

export function MessagesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');

  const inbox = usePaginatedList<MessageRow>('messages/inbox', params, tab === 'inbox');
  const sent = usePaginatedList<MessageRow>('messages/sent', params, tab === 'sent');
  const active = tab === 'inbox' ? inbox : sent;

  const { data: empOptions = [] } = useEmployeeOptions();

  // compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recipients, setRecipients] = useState<string[]>([]);

  // view dialog
  const [viewId, setViewId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [replyBody, setReplyBody] = useState('');

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/messages/${id}`),
    { success: ui('تم حذف الرسالة'), invalidate: ['messages/sent'] },
  );

  const stats = useMemo(
    () => [
      {
        title: tab === 'inbox' ? ui('الوارد') : ui('الصادر'),
        value: toArabicDigits(active.data?.total ?? 0),
        icon: tab === 'inbox' ? <Inbox className="size-5" /> : <Send className="size-5" />,
      },
    ],
    [tab, active.data],
  );

  const openCompose = () => {
    setForm(EMPTY_FORM);
    setRecipients([]);
    setComposeOpen(true);
  };

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error(ui('العنوان والنص مطلوبان'));
      return;
    }
    if (!form.sendAll && recipients.length === 0) {
      toast.error(ui('اختر مستلمًا واحدًا على الأقل'));
      return;
    }
    try {
      await api.post('/messages', {
        title: form.title,
        subject: form.subject || undefined,
        body: form.body,
        sendAll: form.sendAll,
        recipientEmpIds: form.sendAll ? undefined : recipients.map((v) => parseInt(v, 10)),
      });
      toast.success(ui('تم إرسال الرسالة'));
      setComposeOpen(false);
      void sent.refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openView = async (id: number) => {
    setViewId(id);
    setDetail(null);
    setReplyBody('');
    try {
      const { data } = await api.get<MessageDetail>(`/messages/${id}`);
      setDetail(data);
      // opening an inbox message marks it seen server-side; refresh the list.
      if (tab === 'inbox') void inbox.refetch();
    } catch (e) {
      toast.error(apiError(e));
      setViewId(null);
    }
  };

  const sendReply = async () => {
    if (!viewId || !replyBody.trim()) {
      toast.error(ui('اكتب نص الرد'));
      return;
    }
    try {
      await api.post(`/messages/${viewId}/reply`, { body: replyBody });
      toast.success(ui('تم إرسال الرد'));
      setReplyBody('');
      setViewId(null);
      void sent.refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<MessageRow>[]>(() => {
    const cols: ColumnDef<MessageRow>[] = [
      {
        accessorKey: 'id',
        header: ui('م'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      {
        accessorKey: tab === 'inbox' ? 'fromName' : 'toName',
        header: tab === 'inbox' ? ui('المرسِل') : ui('المستلِم'),
        cell: ({ getValue }) => (getValue() as string | null) ?? '—',
      },
      { accessorKey: 'title', header: ui('العنوان'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      {
        accessorKey: 'date',
        header: ui('التاريخ'),
        cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
      },
      {
        accessorKey: 'seen',
        header: ui('الحالة'),
        cell: ({ getValue }) => {
          const seen = getValue() as boolean;
          return (
            <StatusBadge
              status={seen ? 'approved' : 'pending'}
              label={seen ? ui('مقروءة') : ui('غير مقروءة')}
            />
          );
        },
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('عرض')}
              onClick={() => void openView(row.original.id)}
            >
              <Eye className="size-4" />
            </Button>
            {tab === 'sent' && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={ui('حذف')}
                onClick={async () => {
                  const ok = await confirm({
                    title: ui('حذف الرسالة'),
                    description: ui('هل تريد حذف هذه الرسالة؟'),
                    confirmLabel: ui('حذف'),
                    variant: 'destructive',
                  });
                  if (ok) deleteMutation.mutate(row.original.id);
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, params.page, params.pageSize]);

  return (
    <>
      <ListPageShell
        title={ui('الرسائل الداخلية')}
        description={ui('المراسلات والمذكرات الداخلية بين الموظفين')}
        stats={stats}
        statsLoading={active.isLoading}
        isError={active.isError}
        error={active.error}
        actions={
          <Button variant="brand" size="sm" onClick={openCompose}>
            <Plus className="size-4" /> {ui('رسالة جديدة')}
          </Button>
        }
      >
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as 'inbox' | 'sent');
            setParams({ page: 1, search: '' });
          }}
        >
          <TabsList>
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="size-4" /> {ui('الوارد')}
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="size-4" /> {ui('الصادر')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            <DataTable
              columns={columns}
              data={inbox.data?.data ?? []}
              total={inbox.data?.total ?? 0}
              page={params.page}
              pageSize={params.pageSize}
              onPageChange={(p) => setParams({ page: p })}
              onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
              isLoading={inbox.isLoading}
              isError={inbox.isError}
              onRetry={() => void inbox.refetch()}
              search={params.search}
              onSearchChange={(s) => setParams({ search: s, page: 1 })}
              emptyTitle={ui('لا توجد رسائل واردة')}
            />
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <DataTable
              columns={columns}
              data={sent.data?.data ?? []}
              total={sent.data?.total ?? 0}
              page={params.page}
              pageSize={params.pageSize}
              onPageChange={(p) => setParams({ page: p })}
              onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
              isLoading={sent.isLoading}
              isError={sent.isError}
              onRetry={() => void sent.refetch()}
              search={params.search}
              onSearchChange={(s) => setParams({ search: s, page: 1 })}
              emptyTitle={ui('لا توجد رسائل صادرة')}
            />
          </TabsContent>
        </Tabs>
      </ListPageShell>

      {/* compose */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('رسالة جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="msg-send-all">{ui('إرسال للجميع')}</Label>
              <Switch
                id="msg-send-all"
                checked={form.sendAll}
                onCheckedChange={(sendAll) => setForm((f) => ({ ...f, sendAll }))}
              />
            </div>

            {!form.sendAll && (
              <div>
                <Label>{ui('المستلمون')}</Label>
                <div className="mt-1.5">
                  <MultiSelect
                    values={recipients}
                    onValuesChange={setRecipients}
                    options={empOptions}
                    placeholder={ui('اختر المستلمين…')}
                    searchPlaceholder={ui('بحث في الموظفين…')}
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="msg-title">{ui('العنوان')}</Label>
              <Input
                id="msg-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="msg-subject">{ui('الموضوع')}</Label>
              <Input
                id="msg-subject"
                className="mt-1.5"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="msg-body">{ui('النص')}</Label>
              <Textarea
                id="msg-body"
                className="mt-1.5"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void send()}>
              <Send className="size-4" /> {ui('إرسال')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* view + reply */}
      <Dialog open={viewId != null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{detail?.title ?? ui('عرض الرسالة')}</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{ui('جارٍ التحميل…')}</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{ui('من:')} {detail.fromName ?? '—'}</span>
                <span>·</span>
                <DateText value={detail.date ?? undefined} />
                {detail.sendAll && <Badge variant="secondary">{ui('مرسلة للجميع')}</Badge>}
              </div>
              {detail.subject && (
                <div>
                  <Label>{ui('الموضوع')}</Label>
                  <p className="mt-1 text-sm">{detail.subject}</p>
                </div>
              )}
              <div>
                <Label>{ui('النص')}</Label>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.body ?? '—'}</p>
              </div>
              {detail.isSender && detail.recipients.length > 0 && (
                <div>
                  <Label>{ui('المستلمون')}</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {detail.recipients.map((r) => (
                      <Badge key={r.id} variant={r.seen ? 'success' : 'secondary'}>
                        {r.empName ?? '—'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {!detail.isSender && (
                <div>
                  <Label htmlFor="reply-body">{ui('الرد')}</Label>
                  <Textarea
                    id="reply-body"
                    className="mt-1.5"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={ui('اكتب ردك…')}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewId(null)}>
              {ui('إغلاق')}
            </Button>
            {detail && !detail.isSender && (
              <Button onClick={() => void sendReply()}>
                <Send className="size-4" /> {ui('إرسال الرد')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
