import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Save, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface StaffAccount {
  userId: number;
  username: string | null;
  name: string | null;
  enabled: boolean;
  otherPerson: boolean;
  roles: { id: number; key: string; name: string }[];
  hasJobRole: boolean;
}

interface StaffRow {
  id: number;
  empCode: number | null;
  name: string;
  phone: string | null;
  branchId: number | null;
  branchName: string | null;
  active: boolean;
  section: number;
  jobTitleId: number | null;
  jobTitleText: string | null;
  accounts: StaffAccount[];
}

interface StaffSetupResponse {
  rows: StaffRow[];
  jobTitles: { id: number; name: string }[];
}

interface Draft {
  section: number;
  jobTitleId: number | null;
}

const QUERY_KEY = ['rbac', 'staff-setup'] as const;
const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

/** What still keeps this employee from opening the system correctly (empty = all set). */
function problems(row: StaffRow): string[] {
  const out: string[] = [];
  if (!row.jobTitleId) out.push('مالوش مسمى وظيفي');
  const own = row.accounts.filter((a) => !a.otherPerson);
  if (!row.accounts.length) out.push('مالوش حساب دخول');
  else if (!own.length) out.push('الحساب باسم شخص تاني');
  else {
    if (row.active && !own.some((a) => a.enabled)) out.push('الحساب موقوف');
    if (row.jobTitleId && !own.some((a) => a.hasJobRole)) out.push('مالوش صلاحيات المسمى');
  }
  return out;
}

/** System administration → تظبيط الموظفين: section (رجالي/حريمي) and job title for every employee. */
export function StaffSetupPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canManage = can('admin.roles:manage');
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<StaffSetupResponse>('/rbac/staff-setup')).data,
  });
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [needsWorkOnly, setNeedsWorkOnly] = useState(true);
  const localizedDigits = ui('٠١٢٣٤٥٦٧٨٩');
  const fmt = (value: number | string) => String(value).replace(/\d/g, (d) => localizedDigits[Number(d)] ?? d);

  const rows = query.data?.rows ?? [];
  const jobTitles = query.data?.jobTitles ?? [];
  const branches = useMemo(() => {
    const seen = new Map<number, string>();
    rows.forEach((r) => r.branchId != null && seen.set(r.branchId, r.branchName ?? `#${r.branchId}`));
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  const draftOf = (row: StaffRow): Draft => drafts[row.id] ?? { section: row.section, jobTitleId: row.jobTitleId };
  const isDirty = (row: StaffRow) => {
    const d = drafts[row.id];
    return !!d && (d.section !== row.section || d.jobTitleId !== row.jobTitleId);
  };
  // A row stays visible while it is being edited, even after it stops matching the filters.
  const visible = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (drafts[r.id]) return true;
      if (activeOnly && !r.active) return false;
      if (branch && String(r.branchId) !== branch) return false;
      if (needsWorkOnly && problems(r).length === 0) return false;
      if (!q) return true;
      return r.name.includes(q) || String(r.empCode ?? '').includes(q) || (r.phone ?? '').includes(q);
    });
  }, [rows, drafts, search, branch, activeOnly, needsWorkOnly]);

  const activeRows = rows.filter((r) => r.active);
  const needingWork = activeRows.filter((r) => problems(r).length > 0).length;
  const dirtyRows = rows.filter(isDirty);

  const save = useMutation({
    mutationFn: async (row: StaffRow) => {
      const d = draftOf(row);
      return (
        await api.put<{ row: StaffRow; createdAccount: { username: string; password: string } | null }>(
          `/rbac/staff-setup/${row.id}`,
          { section: d.section, jobTitleId: d.jobTitleId },
        )
      ).data;
    },
    onMutate: (row) => setSaving((s) => new Set(s).add(row.id)),
    onSettled: (_data, _error, row) =>
      setSaving((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      }),
    onSuccess: (data, row) => {
      qc.setQueryData<StaffSetupResponse>(QUERY_KEY, (old) =>
        old ? { ...old, rows: old.rows.map((r) => (r.id === row.id ? data.row : r)) } : old,
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      if (data.createdAccount) {
        toast.success(
          `${row.name}: ${ui('اتعمله حساب — اسم المستخدم')} ${data.createdAccount.username} ${ui('وكلمة المرور')} ${data.createdAccount.password}`,
          { duration: 15000 },
        );
      } else {
        toast.success(`${ui('اتحفظ')}: ${row.name}`);
      }
    },
    onError: (error, row) => toast.error(`${row.name}: ${apiError(error)}`),
  });

  const saveRow = (row: StaffRow) => {
    const d = draftOf(row);
    if (!d.jobTitleId) {
      toast.error(`${row.name}: ${ui('اختار المسمى الوظيفي')}`);
      return Promise.resolve();
    }
    return save.mutateAsync(row).catch(() => undefined);
  };

  const saveAll = async () => {
    for (const row of dirtyRows) await saveRow(row);
  };

  const setDraft = (row: StaffRow, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [row.id]: { ...draftOf(row), ...patch } }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ui('إدارة النظام')}
        title={ui('تظبيط الموظفين')}
        description={ui('حدد لكل موظف رجالي ولا حريمي ومسماه الوظيفي واضغط حفظ: حسابه بيتظبط لوحده (صلاحيات المسمى، ويتفعّل لو الموظف نشط، ويتعمله حساب برقم موبايله وكلمة مرور 102030 لو مالوش).')}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{ui('النشطين:')} {fmt(activeRows.length)}</Badge>
            <Badge variant={needingWork ? 'destructive' : 'outline'}>{ui('محتاجين تظبيط:')} {fmt(needingWork)}</Badge>
          </div>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={ui('ابحث بالاسم أو الكود أو الموبايل')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={cn(selectCls, 'w-auto min-w-40')} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={ui('الفرع')}>
          <option value="">{ui('كل الفروع')}</option>
          {branches.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={needsWorkOnly} onCheckedChange={setNeedsWorkOnly} />
          {ui('اللي محتاجين تظبيط بس')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
          {ui('النشطين بس')}
        </label>
        {canManage && dirtyRows.length > 0 && (
          <Button size="sm" onClick={() => void saveAll()} disabled={saving.size > 0}>
            <Save className="size-4" /> {ui('حفظ الكل')} ({fmt(dirtyRows.length)})
          </Button>
        )}
      </Card>

      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-[50vh] w-full" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={needsWorkOnly ? ui('كل الموظفين متظبطين') : ui('مافيش موظفين مطابقين')}
          description={needsWorkOnly ? ui('اقفل "اللي محتاجين تظبيط بس" عشان تشوف الكل.') : ui('غيّر البحث أو الفلاتر.')}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui('الموظف')}</TableHead>
                <TableHead className="w-40">{ui('رجالي / حريمي')}</TableHead>
                <TableHead className="w-52">{ui('المسمى الوظيفي')}</TableHead>
                <TableHead className="w-56">{ui('الحساب')}</TableHead>
                <TableHead className="text-end">{ui('حفظ')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const d = draftOf(row);
                const issues = problems(row);
                const dirty = isDirty(row);
                const busy = saving.has(row.id);
                const own = row.accounts.filter((a) => !a.otherPerson);
                return (
                  <TableRow key={row.id} className={cn(dirty && 'bg-primary/5')}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.branchName ?? '—'}</div>
                      <div className="nums text-xs text-muted-foreground" dir="ltr">
                        {row.empCode != null ? `#${row.empCode}` : ''} {row.phone ?? ''}
                      </div>
                      {!row.active && <Badge variant="outline" className="mt-1 text-[11px]">{ui('موقوف')}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" role="radiogroup" aria-label={ui('رجالي / حريمي')}>
                        {[
                          { v: 1, label: ui('رجالي') },
                          { v: 2, label: ui('حريمي') },
                          { v: 3, label: ui('الكل') },
                        ].map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            role="radio"
                            aria-checked={d.section === o.v}
                            disabled={!canManage || busy}
                            onClick={() => setDraft(row, { section: o.v })}
                            className={cn(
                              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                              d.section === o.v
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        className={selectCls}
                        value={d.jobTitleId ?? ''}
                        disabled={!canManage || busy}
                        onChange={(e) => setDraft(row, { jobTitleId: e.target.value ? Number(e.target.value) : null })}
                        aria-label={ui('المسمى الوظيفي')}
                      >
                        <option value="">{ui('اختار المسمى')}</option>
                        {jobTitles.map((j) => (
                          <option key={j.id} value={j.id}>{j.name}</option>
                        ))}
                      </select>
                      {!row.jobTitleId && row.jobTitleText && (
                        <div className="mt-1 max-w-52 whitespace-normal text-[11px] text-muted-foreground">
                          {ui('مكتوب في القديم:')} «{row.jobTitleText}»
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {issues.length === 0 ? (
                          <Badge variant="secondary" className="gap-1 text-[11px]">
                            <CheckCircle2 className="size-3" /> {ui('تمام')}
                          </Badge>
                        ) : (
                          issues.map((p) => (
                            <Badge key={p} variant="outline" className="text-[11px] text-amber-700 dark:text-amber-400">{ui(p)}</Badge>
                          ))
                        )}
                      </div>
                      {own[0]?.username && (
                        <div className="nums mt-1 text-[11px] text-muted-foreground" dir="ltr">{own[0].username}</div>
                      )}
                      {row.accounts.some((a) => a.otherPerson) && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {ui('حساب مربوط باسم:')} {row.accounts.filter((a) => a.otherPerson).map((a) => a.name).join('، ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {canManage && (
                        <Button
                          size="sm"
                          variant={dirty ? 'default' : 'outline'}
                          disabled={busy || (!dirty && issues.length === 0)}
                          onClick={() => void saveRow(row)}
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          {ui('حفظ')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
