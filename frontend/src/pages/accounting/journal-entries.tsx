import { formatDisplayNumber } from '@/lib/number-display';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { formatDate, formatMoney, localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import type {
  AccountNode,
  AccountingSettings,
  JournalEntryRow,
  JournalEntryType,
} from '@/types/accounting';
import { AccountingPageShell } from './accounting-shell';
import {
  ENTRY_TYPE_ORDER,
  ENTRY_TYPE_LABELS,
  STATUS_META,
  blankDraft,
  draftTotals,
  toApiLines,
  type DraftEntry,
  type DraftLine,
} from './journal-entry-model';

/** How many entries each "load more" pull adds. */
const PAGE_SIZE = 85;

interface EntriesPage {
  data: JournalEntryRow[];
  total: number;
}

export function JournalEntriesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('accounting.journal:create');
  const canUpdate = can('accounting.journal:update');
  const canDelete = can('accounting.journal:delete');
  const canApprove = can('accounting.journal:approve');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<JournalEntryType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<JournalEntryRow['status'] | 'all'>('all');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<JournalEntryRow[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftEntry>(() => blankDraft(localToday()));
  const [viewEntry, setViewEntry] = useState<JournalEntryRow | null>(null);
  const [reverseId, setReverseId] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change restarts paging — otherwise page 2 of the old filter would
  // be appended underneath page 1 of the new one.
  useEffect(() => {
    setPage(1);
    setLoaded([]);
  }, [debouncedSearch, typeFilter, statusFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['accounting', 'journal-entries', debouncedSearch, typeFilter, statusFilter, page],
    queryFn: async ({ signal }) => {
      const { data: d } = await api.get<EntriesPage>('/accounting/journal-entries', {
        params: {
          page,
          pageSize: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(typeFilter !== 'all' ? { entryType: typeFilter } : {}),
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        },
        signal,
      });
      return d;
    },
    placeholderData: (previous) => previous,
  });

  const { data: accountsTree } = useQuery({
    queryKey: ['accounting', 'accounts', 'tree'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountNode[]>('/accounting/accounts/tree');
      return d;
    },
  });
  const postableAccounts = useMemo(() => flattenPostable(accountsTree ?? []), [accountsTree]);
  const accountById = useMemo(
    () => new Map(postableAccounts.map((a) => [String(a.id), a])),
    [postableAccounts],
  );

  const { data: settings } = useQuery({
    queryKey: ['accounting', 'settings'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountingSettings>('/accounting/settings');
      return d;
    },
    retry: false,
  });
  const currency = settings?.currencySymbol ?? 'ج.م';

  useEffect(() => {
    const rows = data?.data;
    if (!rows) return;
    setLoaded((current) => {
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const row of rows) byId.set(row.id, row);
      return [...byId.values()].sort((a, b) => b.id - a.id);
    });
  }, [data]);

  const total = data?.total ?? loaded.length;
  const displayed = loaded.length;
  const remaining = Math.max(total - displayed, 0);

  function resetPaging() {
    setLoaded([]);
    setPage(1);
  }

  async function reload() {
    resetPaging();
    await queryClient.invalidateQueries({ queryKey: ['accounting'] });
  }

  const totals = draftTotals(draft);
  const debitLines = draft.lines.filter((l) => l.side === 'debit');
  const creditLines = draft.lines.filter((l) => l.side === 'credit');
  const everyLineHasAccount = draft.lines.every((l) => l.accountId !== '');
  const canSave =
    totals.isBalanced &&
    totals.totalDebit > 0 &&
    everyLineHasAccount &&
    draft.description.trim().length > 0;

  const saveEntry = useMutation({
    mutationFn: async () => {
      const body = {
        date: draft.date,
        description: draft.description.trim(),
        reference: draft.reference.trim() || undefined,
        entryType: draft.entryType,
        lines: toApiLines(draft),
      };
      if (editingId != null) await api.put(`/accounting/journal-entries/${editingId}`, body);
      else await api.post('/accounting/journal-entries', body);
    },
    onSuccess: () => {
      toast.success(editingId != null ? ui('تم تعديل القيد') : ui('تم حفظ المسودة'));
      setEditorOpen(false);
      void reload();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openCreate() {
    setEditingId(null);
    setDraft(blankDraft(localToday()));
    setEditorOpen(true);
  }

  function openEdit(entry: JournalEntryRow) {
    setEditingId(entry.id);
    setDraft({
      date: entry.date,
      entryType: ENTRY_TYPE_ORDER.includes(entry.entryType) ? entry.entryType : 'daily',
      reference: entry.reference ?? '',
      description: entry.description ?? '',
      lines: (entry.lines ?? []).map<DraftLine>((line) => ({
        side: Number(line.credit) > 0 ? 'credit' : 'debit',
        accountId: line.accountId != null ? String(line.accountId) : '',
        amount: String(Number(line.credit) > 0 ? line.credit : line.debit),
        description: line.description ?? '',
      })),
    });
    setViewEntry(null);
    setEditorOpen(true);
  }

  function addLine(side: DraftLine['side']) {
    setDraft((current) => ({
      ...current,
      lines: [...current.lines, { side, accountId: '', amount: '', description: '' }],
    }));
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function removeLine(index: number) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((_, i) => i !== index),
    }));
  }

  async function postEntry(entry: JournalEntryRow) {
    if (pendingId != null) return;
    setPendingId(entry.id);
    try {
      await api.post(`/accounting/journal-entries/${entry.id}/post`);
      toast.success(ui('تم ترحيل القيد'));
      void reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPendingId(null);
    }
  }

  async function deleteEntry(entry: JournalEntryRow) {
    if (pendingId != null) return;
    if (!(await confirm({ title: ui('حذف المسودة؟'), variant: 'destructive' }))) return;
    setPendingId(entry.id);
    try {
      await api.delete(`/accounting/journal-entries/${entry.id}`);
      toast.success(ui('تم الحذف'));
      void reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AccountingPageShell
      title={ui('القيود المحاسبية')}
      description={ui('إدارة القيود اليومية والشهرية والسنوية')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ui('البحث عن قيد...')}
              aria-label={ui('البحث عن قيد...')}
              className="pe-9"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v: JournalEntryType | 'all') => setTypeFilter(v)}
          >
            <SelectTrigger className="w-40" aria-label={ui('نوع القيد')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ui('جميع الأنواع')}</SelectItem>
              {ENTRY_TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {ui(ENTRY_TYPE_LABELS[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v: JournalEntryRow['status'] | 'all') => setStatusFilter(v)}
          >
            <SelectTrigger className="w-40" aria-label={ui('الحالة')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ui('جميع الحالات')}</SelectItem>
              <SelectItem value="draft">{ui('مسودة')}</SelectItem>
              <SelectItem value="posted">{ui('مرحّل')}</SelectItem>
              <SelectItem value="reversed">{ui('معكوس')}</SelectItem>
            </SelectContent>
          </Select>
          {canCreate && (
            <Button permissionAction="create" variant="brand" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {ui('إضافة قيد جديد')}
            </Button>
          )}
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="nums">
            {ui('قائمة القيود')} ({formatDisplayNumber(displayed)} {ui('من')} {formatDisplayNumber(total)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم القيد')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('التاريخ')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('النوع')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الوصف')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('المبلغ')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الحالة')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الإجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && loaded.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {ui('جاري التحميل…')}
                      </span>
                    </td>
                  </tr>
                )}
                {!isLoading && isError && loaded.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <span>{ui('تعذّر تحميل القيود')}</span>
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                          {ui('إعادة المحاولة')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && loaded.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground">
                      {ui('لا توجد قيود')}
                    </td>
                  </tr>
                )}
                {loaded.map((entry) => {
                  const status = STATUS_META[entry.status] ?? STATUS_META.draft;
                  return (
                    <tr key={entry.id} className="border-b transition-colors hover:bg-accent/40">
                      <td className="nums px-4 py-3">{entry.entryNo}</td>
                      <td className="nums px-4 py-3">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={entry.entryType === 'daily' ? 'default' : 'secondary'}>
                          {ui(ENTRY_TYPE_LABELS[entry.entryType] ?? ENTRY_TYPE_LABELS.daily)}
                        </Badge>
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-3" title={entry.description ?? ''}>
                        {entry.description || '—'}
                      </td>
                      <td className="nums px-4 py-3 font-semibold">
                        {formatMoney(entry.totalDebit, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{ui(status.label)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            permissionAction={null}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={ui('عرض التفاصيل')}
                            aria-label={`${ui('عرض التفاصيل')} — ${entry.entryNo}`}
                            onClick={() => setViewEntry(entry)}
                          >
                            <FileText className="h-4 w-4 text-primary" />
                          </Button>
                          {entry.status === 'draft' && canApprove && (
                            <Button
                              permissionAction="approve"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={ui('ترحيل')}
                              aria-label={`${ui('ترحيل')} — ${entry.entryNo}`}
                              disabled={pendingId === entry.id}
                              onClick={() => void postEntry(entry)}
                            >
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          {entry.status === 'draft' && canUpdate && (
                            <Button
                              permissionAction="update"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={ui('تعديل')}
                              aria-label={`${ui('تعديل')} — ${entry.entryNo}`}
                              onClick={() => openEdit(entry)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === 'draft' && canDelete && (
                            <Button
                              permissionAction="delete"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={ui('حذف')}
                              aria-label={`${ui('حذف')} — ${entry.entryNo}`}
                              disabled={pendingId === entry.id}
                              onClick={() => void deleteEntry(entry)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {entry.status === 'posted' && canApprove && (
                            <Button
                              permissionAction="execute"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={ui('عكس القيد')}
                              aria-label={`${ui('عكس القيد')} — ${entry.entryNo}`}
                              onClick={() => {
                                setReverseId(entry.id);
                                setReverseReason('');
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {remaining > 0 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                className="w-full md:w-auto"
                disabled={isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {ui('جاري التحميل…')}
                  </>
                ) : (
                  <span className="nums">
                    {ui('تحميل المزيد')} ({formatDisplayNumber(remaining)} {ui('متبقي')})
                  </span>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / edit ─────────────────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent size="form">
          <DialogHeader>
            <DialogTitle>
              {editingId != null ? ui('تعديل القيد المحاسبي') : ui('إضافة قيد محاسبي جديد')}
            </DialogTitle>
            <DialogDescription>
              {ui('أدخل تفاصيل القيد المحاسبي مع التأكد من تساوي المدين والدائن')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{ui('تاريخ القيد')} *</Label>
                <Input
                  className="nums"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{ui('نوع القيد')} *</Label>
                <Select
                  value={draft.entryType}
                  onValueChange={(v: JournalEntryType) => setDraft({ ...draft, entryType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPE_ORDER.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ui(ENTRY_TYPE_LABELS[type])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ui('رقم المرجع')}</Label>
                <Input
                  value={draft.reference}
                  placeholder={ui('رقم المرجع (اختياري)')}
                  onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{ui('الوصف')} *</Label>
              <Textarea
                rows={3}
                value={draft.description}
                placeholder={ui('أدخل وصف القيد')}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <LineSection
              side="debit"
              lines={debitLines}
              allLines={draft.lines}
              accounts={postableAccounts}
              accountById={accountById}
              currency={currency}
              onAdd={() => addLine('debit')}
              onUpdate={updateLine}
              onRemove={removeLine}
            />
            <LineSection
              side="credit"
              lines={creditLines}
              allLines={draft.lines}
              accounts={postableAccounts}
              accountById={accountById}
              currency={currency}
              onAdd={() => addLine('credit')}
              onUpdate={updateLine}
              onRemove={removeLine}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div
                className={`rounded-xl border-2 p-4 ${
                  totals.isBalanced ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-muted-foreground">{ui('إجمالي المدين')}:</span>
                  <span className="nums text-lg font-bold text-primary">
                    {formatMoney(totals.totalDebit, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted-foreground">{ui('إجمالي الدائن')}:</span>
                  <span className="nums text-lg font-bold text-success">
                    {formatMoney(totals.totalCredit, currency)}
                  </span>
                </div>
              </div>
              <div
                className={`rounded-xl border-2 p-4 ${
                  totals.isBalanced ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted-foreground">{ui('الفرق')}:</span>
                  <span
                    className={`nums text-xl font-bold ${
                      totals.isBalanced ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {formatMoney(totals.difference, currency)}
                  </span>
                </div>
                {totals.isBalanced ? (
                  <div className="mt-3 flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">{ui('القيد متوازن')}</span>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-destructive">
                    {ui('يجب أن يتساوى إجمالي المدين مع إجمالي الدائن')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              permissionAction={editingId != null ? 'update' : 'create'}
              variant="brand"
              disabled={!canSave || saveEntry.isPending}
              onClick={() => saveEntry.mutate()}
            >
              {saveEntry.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Details ────────────────────────────────────────────────────────── */}
      <Dialog open={viewEntry != null} onOpenChange={(v) => !v && setViewEntry(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{ui('تفاصيل القيد المحاسبي')}</DialogTitle>
            <DialogDescription>{ui('عرض كامل لتفاصيل القيد المحاسبي')}</DialogDescription>
          </DialogHeader>
          {viewEntry && (
            <EntryDetails entry={viewEntry} currency={currency} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewEntry(null)}>
              {ui('إغلاق')}
            </Button>
            {viewEntry?.status === 'draft' && canUpdate && (
              <Button
                permissionAction="update"
                variant="brand"
                onClick={() => viewEntry && openEdit(viewEntry)}
              >
                <Pencil className="h-4 w-4" />
                {ui('تعديل')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reverse ────────────────────────────────────────────────────────── */}
      <Dialog open={reverseId != null} onOpenChange={(v) => !v && setReverseId(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui('عكس القيد')}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={ui('سبب العكس')}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseId(null)}>
              {ui('إلغاء')}
            </Button>
            <Button
              permissionAction="execute"
              variant="destructive"
              disabled={!reverseReason.trim() || reversing}
              onClick={async () => {
                if (reversing || reverseId == null) return;
                setReversing(true);
                try {
                  const ok = await confirmWithPreview(
                    {
                      title: ui('عكس القيد'),
                      confirmLabel: ui('تأكيد العكس'),
                      variant: 'destructive',
                    },
                    async () => {
                      const { data: preview } = await api.post(
                        `/accounting/journal-entries/${reverseId}/reverse?dryRun=true`,
                        { reason: reverseReason.trim() },
                      );
                      return {
                        rows: (preview as { rows?: { label: string; before?: string; after?: string }[] })
                          .rows,
                        warning: (preview as { warning?: string }).warning,
                      };
                    },
                    async () => {
                      await api.post(`/accounting/journal-entries/${reverseId}/reverse`, {
                        reason: reverseReason.trim(),
                      });
                    },
                  );
                  if (ok) {
                    toast.success(ui('تم عكس القيد'));
                    setReverseId(null);
                    void reload();
                  }
                } catch (e) {
                  toast.error(apiError(e));
                } finally {
                  setReversing(false);
                }
              }}
            >
              {ui('تأكيد العكس')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingPageShell>
  );
}

/** One coloured half of the editor: every debit line, or every credit line. */
function LineSection({
  side,
  lines,
  allLines,
  accounts,
  accountById,
  currency,
  onAdd,
  onUpdate,
  onRemove,
}: {
  side: DraftLine['side'];
  lines: DraftLine[];
  allLines: DraftLine[];
  accounts: AccountNode[];
  accountById: Map<string, AccountNode>;
  currency: string;
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<DraftLine>) => void;
  onRemove: (index: number) => void;
}) {
  const { ui } = useLocale();
  const isDebit = side === 'debit';
  const accent = isDebit ? 'bg-primary' : 'bg-success';
  const panel = isDebit ? 'border-primary/25 bg-primary/5' : 'border-success/25 bg-success/5';
  const rowBorder = isDebit ? 'border-primary/25' : 'border-success/25';

  return (
    <div className={`space-y-3 rounded-xl border p-4 ${panel}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-8 w-2 rounded ${accent}`} aria-hidden="true" />
          <Label className="text-lg font-bold">
            {isDebit ? ui('حسابات المدين') : ui('حسابات الدائن')} *
          </Label>
        </div>
        <Button permissionAction={null} type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {isDebit ? ui('إضافة مدين') : ui('إضافة دائن')}
        </Button>
      </div>

      {lines.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          {isDebit ? ui('أضف حساب مدين واحد على الأقل') : ui('أضف حساب دائن واحد على الأقل')}
        </p>
      )}

      {lines.map((line) => {
        const index = allLines.indexOf(line);
        const selected = accountById.get(line.accountId);
        return (
          <div key={index} className={`space-y-2 rounded-lg border bg-card p-3 ${rowBorder}`}>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 space-y-1 sm:col-span-6">
                <Label className="text-xs">{ui('الحساب')} *</Label>
                <Select
                  value={line.accountId}
                  onValueChange={(value) => onUpdate(index, { accountId: value })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={ui('اختر')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.length === 0 ? (
                      <div className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                        {ui('لا توجد حسابات')}
                      </div>
                    ) : (
                      accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          <span className="nums font-bold text-primary">{account.code}</span>
                          {' — '}
                          {account.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-9 space-y-1 sm:col-span-4">
                <Label className="text-xs">{ui('المبلغ')} *</Label>
                <Input
                  className="nums h-9 text-sm"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={line.amount}
                  onChange={(e) => onUpdate(index, { amount: e.target.value })}
                />
              </div>
              <div className="col-span-3 flex items-end sm:col-span-2">
                <Button
                  permissionAction={null}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-full"
                  title={ui('حذف السطر')}
                  aria-label={ui('حذف السطر')}
                  onClick={() => onRemove(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="col-span-12">
                <Input
                  className="h-9 text-xs"
                  placeholder={ui('وصف (اختياري)')}
                  value={line.description}
                  onChange={(e) => onUpdate(index, { description: e.target.value })}
                />
              </div>
            </div>

            {selected && (
              <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/50 p-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">{ui('رقم')}:</span>{' '}
                  <span className="nums font-bold text-primary">{selected.code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ui('الاسم')}:</span>{' '}
                  <span className="font-medium">{selected.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">{ui('النوع')}:</span>
                  <Badge variant="outline" className="text-xs">
                    {ui(ACCOUNT_TYPE_LABELS[selected.accountType] ?? selected.accountType)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">{ui('الرصيد')}:</span>{' '}
                  <span className="nums font-semibold">
                    {formatMoney(selected.balance ?? 0, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EntryDetails({ entry, currency }: { entry: JournalEntryRow; currency: string }) {
  const { ui } = useLocale();
  const lines = entry.lines ?? [];
  const debits = lines.filter((l) => Number(l.debit) > 0);
  const credits = lines.filter((l) => Number(l.credit) > 0);
  const status = STATUS_META[entry.status] ?? STATUS_META.draft;
  const difference = Number(entry.totalDebit) - Number(entry.totalCredit);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-xl bg-muted/40 p-4 md:grid-cols-3">
        <div>
          <Label className="text-sm text-muted-foreground">{ui('رقم القيد')}</Label>
          <p className="nums text-lg font-bold">{entry.entryNo}</p>
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">{ui('تاريخ القيد')}</Label>
          <p className="nums font-medium">{entry.date}</p>
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">{ui('نوع القيد')}</Label>
          <div className="mt-1">
            <Badge variant="outline">{ui(ENTRY_TYPE_LABELS[entry.entryType] ?? ENTRY_TYPE_LABELS.daily)}</Badge>
          </div>
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">{ui('الحالة')}</Label>
          <div className="mt-1">
            <Badge variant={status.variant}>{ui(status.label)}</Badge>
          </div>
        </div>
        {entry.reference && (
          <div>
            <Label className="text-sm text-muted-foreground">{ui('المرجع')}</Label>
            <p className="font-medium">{entry.reference}</p>
          </div>
        )}
        <div className="md:col-span-3">
          <Label className="text-sm text-muted-foreground">{ui('الوصف')}</Label>
          <p className="mt-1 font-medium">{entry.description || '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SideTable
          title={ui('حسابات المدين')}
          accent="primary"
          currency={currency}
          rows={debits.map((l) => ({
            code: l.accountCode ?? String(l.accountId ?? ''),
            name: l.accountName ?? ui('غير معروف'),
            amount: Number(l.debit),
            description: l.description ?? '',
          }))}
        />
        <SideTable
          title={ui('حسابات الدائن')}
          accent="success"
          currency={currency}
          rows={credits.map((l) => ({
            code: l.accountCode ?? String(l.accountId ?? ''),
            name: l.accountName ?? ui('غير معروف'),
            amount: Number(l.credit),
            description: l.description ?? '',
          }))}
        />
      </div>

      <div className="rounded-xl border-2 border-success/40 bg-muted/30 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-muted-foreground">{ui('إجمالي المدين')}:</span>
          <span className="nums text-lg font-bold text-primary">
            {formatMoney(entry.totalDebit, currency)}
          </span>
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-muted-foreground">{ui('إجمالي الدائن')}:</span>
          <span className="nums text-lg font-bold text-success">
            {formatMoney(entry.totalCredit, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <span className="font-semibold text-muted-foreground">{ui('الفرق')}:</span>
          <span
            className={`nums text-xl font-bold ${
              Math.abs(difference) < 0.01 ? 'text-success' : 'text-destructive'
            }`}
          >
            {formatMoney(difference, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SideTable({
  title,
  accent,
  currency,
  rows,
}: {
  title: string;
  accent: 'primary' | 'success';
  currency: string;
  rows: { code: string; name: string; amount: number; description: string }[];
}) {
  const { ui } = useLocale();
  const bar = accent === 'primary' ? 'bg-primary' : 'bg-success';
  const head = accent === 'primary' ? 'bg-primary/10' : 'bg-success/10';
  const codeColor = accent === 'primary' ? 'text-primary' : 'text-success';
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-6 w-2 rounded ${bar}`} aria-hidden="true" />
        <Label className={`text-lg font-bold ${codeColor}`}>{title}</Label>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className={head}>
            <tr>
              <th className="px-4 py-2 text-start font-semibold">{ui('رقم الحساب')}</th>
              <th className="px-4 py-2 text-start font-semibold">{ui('اسم الحساب')}</th>
              <th className="px-4 py-2 text-start font-semibold">{ui('المبلغ')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.code}-${index}`} className="border-t">
                <td className={`nums px-4 py-2 font-medium ${codeColor}`}>{row.code}</td>
                <td className="px-4 py-2">{row.name}</td>
                <td className="nums px-4 py-2 font-bold">{formatMoney(row.amount, currency)}</td>
              </tr>
            ))}
            <tr className={`${head} font-bold`}>
              <td colSpan={2} className="px-4 py-2">
                {ui('الإجمالي')}
              </td>
              <td className="nums px-4 py-2">{formatMoney(totalAmount, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {rows.some((row) => row.description) && (
        <div className="space-y-2">
          {rows.map(
            (row, index) =>
              row.description && (
                <div key={`${row.code}-note-${index}`} className={`rounded p-2 text-sm ${head}`}>
                  <span className={`nums font-medium ${codeColor}`}>{row.code}:</span>{' '}
                  {row.description}
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
};

function flattenPostable(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const node of list) {
      if (node.isPostable) out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
