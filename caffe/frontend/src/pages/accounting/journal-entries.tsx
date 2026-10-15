import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
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
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { localToday } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { AccountNode, JournalEntryLine, JournalEntryRow } from '@/types/accounting';
import { useLocale } from '@/store/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { indexColumn } from '../inventory/simple-crud-tab';
import { AccountingPageShell } from './accounting-shell';

const EMPTY_LINE = (): JournalEntryLine => ({ debit: 0, credit: 0, accountId: undefined });

export function JournalEntriesPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<JournalEntryRow>(
    'accounting/journal-entries',
    params,
  );
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => localToday());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalEntryLine[]>([EMPTY_LINE(), EMPTY_LINE()]);
  const [saving, setSaving] = useState(false);
  const [reverseId, setReverseId] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  // Tracks the entry id currently being posted/deleted so the row action can't be double-clicked.
  const [pendingId, setPendingId] = useState<number | null>(null);
  // In-flight guard for the reverse-confirm button.
  const [reversing, setReversing] = useState(false);

  // Post/reverse/delete mutate posted balances — refresh every accounting report cache.
  const invalidateAccounting = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounting'] });
  };

  const { data: accountsTree } = useQuery({
    queryKey: ['accounting', 'accounts', 'tree'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountNode[]>('/accounting/accounts/tree');
      return d;
    },
  });
  const postableAccounts = flattenPostable(accountsTree ?? []);

  const filters: FilterField[] = [
    {
      key: 'status',
      label: ui('الحالة'),
      type: 'select',
      options: [
        { value: 'draft', label: ui('مسودة') },
        { value: 'posted', label: ui('مرحّل') },
        { value: 'reversed', label: ui('معكوس') },
      ],
    },
  ];

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const allLinesHaveAccount = lines.every((l) => l.accountId != null);
  // A valid entry must balance, move a non-zero total, and have an account on every line.
  const balanced =
    Math.abs(totalDebit - totalCredit) <= 0.01 && totalDebit > 0 && allLinesHaveAccount;

  const columns = useMemo<ColumnDef<JournalEntryRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<JournalEntryRow>,
      { accessorKey: 'entryNo', header: ui('رقم القيد'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'date', header: ui('التاريخ'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'description', header: ui('الوصف'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'status', header: ui('الحالة') },
      {
        accessorKey: 'totalDebit',
        header: ui('مدين'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number).toFixed(2))}</span>,
      },
      {
        accessorKey: 'totalCredit',
        header: ui('دائن'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number).toFixed(2))}</span>,
      },
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.status === 'draft' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title={ui('ترحيل')}
                  disabled={pendingId === row.original.id}
                  onClick={async () => {
                    if (pendingId != null) return;
                    setPendingId(row.original.id);
                    try {
                      await api.post(`/accounting/journal-entries/${row.original.id}/post`);
                      toast.success(ui('تم ترحيل القيد'));
                      void refetch();
                      invalidateAccounting();
                    } catch (e) {
                      toast.error(apiError(e));
                    } finally {
                      setPendingId(null);
                    }
                  }}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={ui('حذف')}
                  disabled={pendingId === row.original.id}
                  onClick={async () => {
                    if (pendingId != null) return;
                    if (!(await confirm({ title: ui('حذف المسودة؟') }))) return;
                    setPendingId(row.original.id);
                    try {
                      await api.delete(`/accounting/journal-entries/${row.original.id}`);
                      toast.success(ui('تم الحذف'));
                      void refetch();
                      invalidateAccounting();
                    } catch (e) {
                      toast.error(apiError(e));
                    } finally {
                      setPendingId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
            {row.original.status === 'posted' && (
              <Button
                variant="ghost"
                size="icon"
                title={ui('عكس القيد')}
                onClick={() => {
                  setReverseId(row.original.id);
                  setReverseReason('');
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [params.page, params.pageSize, refetch, ui, pendingId],
  );

  async function saveDraft() {
    if (totalDebit <= 0) {
      toast.error(ui('يجب أن يكون إجمالي القيد أكبر من صفر'));
      return;
    }
    if (!allLinesHaveAccount) {
      toast.error(ui('يجب اختيار حساب لكل سطر'));
      return;
    }
    if (!balanced) {
      toast.error(ui('القيد غير متوازن'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/accounting/journal-entries', {
        date,
        description: description || undefined,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description,
        })),
      });
      toast.success(ui('تم حفظ المسودة'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountingPageShell
      title={ui('القيود اليومية')}
      description={ui('إنشاء مسودات، ترحيل، وعكس القيود — القيود المرحّلة لا تُعدّل')}
      actions={
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {ui('قيد جديد')}
        </Button>
      }
    >
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في القيود…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{ui('قيد يومية جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{ui('التاريخ')}</Label>
              <Input className="nums" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{ui('الوصف')}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ui('السطور')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    className="col-span-5 rounded-md border bg-background px-2 py-2 text-sm"
                    value={line.accountId ?? ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx]!, accountId: Number(e.target.value) };
                      setLines(next);
                    }}
                  >
                    <option value="">{ui('اختر حساب')}</option>
                    {postableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-2 nums"
                    placeholder={ui('مدين')}
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.debit || ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx]!, debit: Number(e.target.value), credit: 0 };
                      setLines(next);
                    }}
                  />
                  <Input
                    className="col-span-2 nums"
                    placeholder={ui('دائن')}
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.credit || ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx]!, credit: Number(e.target.value), debit: 0 };
                      setLines(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    disabled={lines.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, EMPTY_LINE()])}>
                {ui('سطر إضافي')}
              </Button>
              <p className={`text-sm ${balanced ? 'text-muted-foreground' : 'text-destructive'}`}>
                {ui('الإجمالي')}: {toArabicDigits(totalDebit.toFixed(2))} / {toArabicDigits(totalCredit.toFixed(2))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" disabled={saving || !balanced} onClick={() => void saveDraft()}>
              {ui('حفظ مسودة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverseId != null} onOpenChange={(v) => !v && setReverseId(null)}>
        <DialogContent>
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
              variant="destructive"
              disabled={!reverseReason.trim() || reversing}
              onClick={async () => {
                if (reversing || reverseId == null) return;
                setReversing(true);
                try {
                  const ok = await confirmWithPreview(
                    { title: ui('عكس القيد'), confirmLabel: ui('تأكيد العكس'), variant: 'destructive' },
                    async () => {
                      const { data } = await api.post(
                        `/accounting/journal-entries/${reverseId}/reverse?dryRun=true`,
                        { reason: reverseReason.trim() },
                      );
                      return {
                        rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows,
                        warning: (data as { warning?: string }).warning,
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
                    void refetch();
                    invalidateAccounting();
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

function flattenPostable(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) {
      if (n.isPostable) out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
