import { formatDisplayNumber } from '@/lib/number-display';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { confirm } from '@/lib/confirm';
import { formatMoney } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import type {
  AccountLevel,
  AccountNode,
  AccountRow,
  AccountType,
  AccountingSettings,
} from '@/types/accounting';
import { AccountingPageShell } from './accounting-shell';
import {
  ACCOUNT_LEVEL_ORDER,
  ACCOUNT_TYPE_ORDER,
  buildAccountTree,
  childLevelOf,
  flattenAccounts,
  levelForDepth,
} from './chart-of-accounts-model';
import { importAccountsWorkbook, type ParsedImportAccount } from './chart-of-accounts-import';

/** How many accounts each "load more" pull adds. */
const PAGE_SIZE = 85;

const TYPE_META: Record<
  AccountType,
  { label: string; icon: typeof Building2; className: string }
> = {
  asset: { label: 'الأصول', icon: Building2, className: 'text-success' },
  liability: { label: 'الخصوم', icon: Wallet, className: 'text-destructive' },
  equity: { label: 'حقوق الملكية', icon: Users, className: 'text-primary' },
  revenue: { label: 'الإيرادات', icon: TrendingUp, className: 'text-primary' },
  expense: { label: 'المصروفات', icon: TrendingDown, className: 'text-warning' },
};

const LEVEL_META: Record<AccountLevel, { label: string; description: string }> = {
  main: { label: 'حساب رئيسي', description: 'الحساب الرئيسي في الشجرة' },
  'sub-main': { label: 'حساب رئيسي فرعي', description: 'حساب فرعي للحساب الرئيسي' },
  sub: { label: 'حساب فرعي', description: 'حساب فرعي للحساب الرئيسي الفرعي' },
};

interface AccountForm {
  code: string;
  name: string;
  type: AccountType;
  accountLevel: AccountLevel;
  parentId: string;
  category: string;
  description: string;
}

const EMPTY_FORM: AccountForm = {
  code: '',
  name: '',
  type: 'asset',
  accountLevel: 'main',
  parentId: '',
  category: '',
  description: '',
};

interface AccountsPage {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function ChartOfAccountsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('accounting.accounts:create');
  const canUpdate = can('accounting.accounts:update');
  const canDelete = can('accounting.accounts:delete');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<AccountRow[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lockedParentId, setLockedParentId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Roots are opened once, on the first page that arrives — re-opening them on every
  // refetch would fight the user every time they collapsed a branch.
  const seededExpansion = useRef(false);

  // Typing filters server-side; debouncing keeps a fast typist from firing a request per key.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setLoaded([]);
  }, [debouncedSearch]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['accounting', 'accounts', 'page', debouncedSearch, page],
    queryFn: async ({ signal }) => {
      const { data: d } = await api.get<AccountsPage>('/accounting/accounts', {
        params: {
          page,
          pageSize: PAGE_SIZE,
          order: 'asc',
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        signal,
      });
      return d;
    },
    placeholderData: (previous) => previous,
  });

  // The parent picker and the importer must see every account, not just the page on
  // screen — with 900+ accounts the parent is almost never in the first 85 rows.
  // Fetched lazily so the initial paint still costs one small page.
  const { data: fullTree } = useQuery({
    queryKey: ['accounting', 'accounts', 'tree'],
    queryFn: async ({ signal }) => {
      const { data: d } = await api.get<AccountNode[]>('/accounting/accounts/tree', { signal });
      return d;
    },
    enabled: dialogOpen || importing,
  });

  const { data: settings } = useQuery({
    queryKey: ['accounting', 'settings'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountingSettings>('/accounting/settings');
      return d;
    },
    retry: false,
  });
  const currency = settings?.currencySymbol ?? 'ج.م';

  // Accumulate pages into one flat set, keyed by id so a refetch replaces rather than duplicates.
  useEffect(() => {
    const rows = data?.data;
    if (!rows) return;
    setLoaded((current) => {
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const row of rows) byId.set(row.id, row);
      return [...byId.values()];
    });
  }, [data]);

  const total = data?.total ?? loaded.length;
  // Search is applied server-side, so whatever came back is exactly what should show.
  const tree = useMemo(() => buildAccountTree(loaded), [loaded]);
  const flat = useMemo(() => flattenAccounts(tree), [tree]);
  const displayed = flat.length;
  const remaining = Math.max(total - displayed, 0);

  useEffect(() => {
    if (seededExpansion.current || tree.length === 0) return;
    seededExpansion.current = true;
    setExpanded(new Set(tree.map((node) => node.id)));
  }, [tree]);

  function resetPaging() {
    setLoaded([]);
    setPage(1);
  }

  async function reload() {
    resetPaging();
    await queryClient.invalidateQueries({ queryKey: ['accounting'] });
  }

  const seedFullTree = useMutation({
    mutationFn: async () => {
      const { data: d } = await api.post<{ created: number; total: number }>(
        '/accounting/accounts/seed-full-chart',
      );
      return d;
    },
    onSuccess: (result) => {
      toast.success(
        `${ui('تم إنشاء شجرة الحسابات الكاملة')} (${formatDisplayNumber(result.created)}/${formatDisplayNumber(result.total)})`,
      );
      void reload();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const saveAccount = useMutation({
    mutationFn: async (payload: AccountForm) => {
      const body = {
        name: payload.name.trim(),
        category: payload.category.trim() || undefined,
        description: payload.description.trim() || undefined,
      };
      if (editingId != null) {
        await api.put(`/accounting/accounts/${editingId}`, body);
        return;
      }
      await api.post('/accounting/accounts', {
        ...body,
        ...(payload.code.trim() ? { code: payload.code.trim() } : {}),
        ...(payload.accountLevel === 'main' ? { type: payload.type } : {}),
        ...(payload.parentId ? { parentId: Number(payload.parentId) } : {}),
      });
    },
    onSuccess: () => {
      toast.success(editingId != null ? ui('تم تعديل الحساب') : ui('تم إنشاء الحساب'));
      setDialogOpen(false);
      void reload();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openCreate(parent?: AccountNode) {
    setEditingId(null);
    setLockedParentId(parent?.id ?? null);
    setForm({
      ...EMPTY_FORM,
      type: parent?.accountType ?? 'asset',
      category: parent?.category ?? '',
      parentId: parent ? String(parent.id) : '',
      accountLevel: parent ? childLevelOf(parent.accountLevel) : 'main',
    });
    setDialogOpen(true);
  }

  function openEdit(account: AccountNode, depth: number) {
    setEditingId(account.id);
    setLockedParentId(account.parentId);
    setForm({
      code: account.code,
      name: account.name,
      type: account.accountType,
      accountLevel: account.accountLevel ?? levelForDepth(depth),
      parentId: account.parentId != null ? String(account.parentId) : '',
      category: account.category ?? '',
      description: account.description ?? '',
    });
    setDialogOpen(true);
  }

  async function removeAccount(account: AccountNode) {
    const ok = await confirm({
      title: ui('حذف الحساب'),
      description: `${ui('سيتم تعطيل الحساب')} «${account.name}» — ${ui('لن يُحذف تاريخه المحاسبي')}`,
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/accounting/accounts/${account.id}`);
      toast.success(ui('تم حذف الحساب'));
      void reload();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  function toggleExpand(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const parsed = await importAccountsWorkbook(file);
      if (parsed.rows.length === 0) {
        toast.error(ui('لم يُعثر على حسابات صالحة في الملف'));
        return;
      }
      const { data: chart } = await api.get<AccountNode[]>('/accounting/accounts/tree');
      const { created, failed } = await createImportedAccounts(
        parsed.rows,
        flattenAccounts(chart ?? []),
      );
      if (failed > 0) {
        toast.warning(
          `${ui('تم إنشاء')} ${formatDisplayNumber(created)} ${ui('حساب')} — ${formatDisplayNumber(failed)} ${ui('حساب لم يُنشأ')}`,
        );
      } else {
        toast.success(`${ui('تم استيراد')} ${formatDisplayNumber(created)} ${ui('حساب')}`);
      }
      void reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const allAccounts = useMemo(() => flattenAccounts(fullTree ?? []), [fullTree]);
  const parentOptions = useMemo(
    () =>
      (allAccounts.length > 0 ? allAccounts : flat)
        .filter((account) => account.id !== editingId)
        .map((account) => ({
          id: account.id,
          label: `${account.code} — ${account.name}`,
        })),
    [allAccounts, flat, editingId],
  );

  const saving = saveAccount.isPending;
  const canSubmit = form.name.trim().length >= 2 && (form.accountLevel === 'main' || Boolean(form.parentId));

  return (
    <AccountingPageShell
      title={ui('شجرة الحسابات')}
      description={ui('إدارة الحسابات المحاسبية وتصنيفها الهرمي')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ui('البحث عن حساب...')}
              aria-label={ui('البحث عن حساب...')}
              className="pe-9"
            />
          </div>
          {canCreate && (
            <Button
              permissionAction="create"
              variant="outline"
              disabled={seedFullTree.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('إنشاء شجرة الحسابات الكاملة'),
                  description: ui('سيتم إنشاء جميع الحسابات الأساسية — آمن للتكرار'),
                });
                if (ok) seedFullTree.mutate();
              }}
            >
              {seedFullTree.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {ui('إنشاء شجرة الحسابات الكاملة')}
            </Button>
          )}
          {canCreate && (
            <Button
              permissionAction="create"
              variant="outline"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {ui('استيراد من Excel')}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          {canCreate && (
            <Button permissionAction="create" variant="brand" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              {ui('إضافة حساب رئيسي')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('تحديث')}
            onClick={() => void reload()}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-primary" />
              {ui('شجرة الحسابات')}
            </span>
            <Badge variant="outline" className="nums px-3 py-1 text-sm">
              {formatDisplayNumber(displayed)} {ui('من')} {formatDisplayNumber(total)} {ui('حساب')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 p-3 text-sm font-semibold text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-1">{ui('رمز')}</div>
              <div className="col-span-3">{ui('اسم الحساب')}</div>
              <div className="col-span-2">{ui('المستوى')}</div>
              <div className="col-span-2">{ui('النوع')}</div>
              <div className="col-span-2">{ui('الرصيد')}</div>
              <div className="col-span-1">{ui('الإجراءات')}</div>
            </div>

            <div className="max-h-[600px] overflow-y-auto">
              {isLoading && loaded.length === 0 && (
                <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {ui('جاري التحميل…')}
                </div>
              )}

              {!isLoading && isError && loaded.length === 0 && (
                <div className="flex flex-col items-center gap-3 p-10 text-muted-foreground">
                  <span>{ui('تعذّر تحميل دليل الحسابات')}</span>
                  <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    <RefreshCw className="h-4 w-4" />
                    {ui('إعادة المحاولة')}
                  </Button>
                </div>
              )}

              {!isLoading && !isError && tree.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  {debouncedSearch
                    ? ui('لا توجد حسابات مطابقة للبحث')
                    : ui('لا توجد حسابات — اضغط «إنشاء شجرة الحسابات الكاملة» للبدء')}
                </div>
              )}

              {tree.map((node) => (
                <AccountTreeRow
                  key={node.id}
                  account={node}
                  depth={0}
                  currency={currency}
                  expanded={expanded}
                  forceExpanded={Boolean(debouncedSearch)}
                  canCreate={canCreate}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onToggle={toggleExpand}
                  onAdd={openCreate}
                  onEdit={openEdit}
                  onDelete={removeAccount}
                />
              ))}
            </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingId != null ? ui('تعديل حساب') : ui('إضافة حساب جديد')}
            </DialogTitle>
            <DialogDescription>
              {lockedParentId != null && editingId == null
                ? ui('أدخل بيانات الحساب الفرعي الجديد')
                : ui('أدخل بيانات الحساب الرئيسي الجديد')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{ui('رمز الحساب')} *</Label>
                <Input
                  className="nums"
                  value={form.code}
                  disabled
                  placeholder={ui('سيتم توليده تلقائياً')}
                />
                {editingId == null && (
                  <p className="text-xs text-muted-foreground">
                    {ui('سيتم توليد الرمز تلقائياً عند الحفظ')}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{ui('اسم الحساب')} *</Label>
                <Input
                  value={form.name}
                  autoFocus
                  maxLength={255}
                  placeholder={ui('اسم الحساب')}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{ui('نوع الحساب')} *</Label>
                <Select
                  value={form.type}
                  disabled={editingId != null || form.accountLevel !== 'main'}
                  onValueChange={(value: AccountType) => setForm({ ...form, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_ORDER.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ui(TYPE_META[type].label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ui('مستوى الحساب')} *</Label>
                <Select
                  value={form.accountLevel}
                  disabled={editingId != null || lockedParentId != null}
                  onValueChange={(value: AccountLevel) =>
                    setForm({
                      ...form,
                      accountLevel: value,
                      parentId: value === 'main' ? '' : form.parentId,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_LEVEL_ORDER.map((level) => (
                      <SelectItem key={level} value={level}>
                        {ui(LEVEL_META[level].label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.accountLevel !== 'main' && (
              <div className="space-y-2">
                <Label>{ui('الحساب الأب')} *</Label>
                <Select
                  value={form.parentId}
                  disabled={editingId != null || lockedParentId != null}
                  onValueChange={(value) => setForm({ ...form, parentId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={ui('اختر الحساب الأب')} />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ui('الحساب الفرعي يرث نوع الحساب الأب')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{ui('التصنيف')}</Label>
              <Input
                value={form.category}
                maxLength={255}
                placeholder={ui('التصنيف')}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{ui('الوصف')}</Label>
              <Textarea
                value={form.description}
                rows={2}
                placeholder={ui('الوصف (اختياري)')}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              permissionAction={editingId != null ? 'update' : 'create'}
              variant="brand"
              disabled={!canSubmit || saving}
              onClick={() => saveAccount.mutate(form)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingPageShell>
  );
}

function AccountTreeRow({
  account,
  depth,
  currency,
  expanded,
  forceExpanded,
  canCreate,
  canUpdate,
  canDelete,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: {
  account: AccountNode;
  depth: number;
  currency: string;
  expanded: Set<number>;
  forceExpanded: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: (id: number) => void;
  onAdd: (parent: AccountNode) => void;
  onEdit: (account: AccountNode, depth: number) => void;
  onDelete: (account: AccountNode) => void;
}) {
  const { ui } = useLocale();
  const hasChildren = account.children.length > 0;
  const isExpanded = forceExpanded || expanded.has(account.id);
  const level = account.accountLevel ?? levelForDepth(depth);
  const type = TYPE_META[account.accountType] ?? TYPE_META.asset;
  const Icon = type.icon;

  return (
    <>
      <div
        className={`grid grid-cols-12 items-center gap-2 border-b p-3 transition-colors hover:bg-accent/40 ${
          depth > 0 ? 'bg-muted/20' : ''
        }`}
      >
        <div className="col-span-1 flex items-center gap-1">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              permissionAction={null}
              className="h-6 w-6"
              aria-label={isExpanded ? ui('طي') : ui('توسيع')}
              aria-expanded={isExpanded}
              onClick={() => onToggle(account.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <span className="h-6 w-6" />
          )}
          <Icon className={`h-4 w-4 shrink-0 ${type.className}`} />
        </div>
        <div className="nums col-span-1 font-medium">{account.code}</div>
        <div className="col-span-3 min-w-0">
          <p
            className="truncate font-medium"
            style={{ paddingInlineStart: `${depth * 1.25}rem` }}
            title={account.name}
          >
            {account.name}
          </p>
        </div>
        <div className="col-span-2">
          <Badge variant={level === 'main' ? 'default' : 'secondary'} className="text-xs">
            {ui(LEVEL_META[level].label)}
          </Badge>
        </div>
        <div className="col-span-2">
          <Badge variant="outline" className="text-xs">
            {ui(type.label)}
          </Badge>
        </div>
        <div className="nums col-span-2 font-semibold">
          {formatMoney(account.balance ?? 0, currency)}
        </div>
        <div className="col-span-1 flex justify-end gap-0.5">
          {canCreate && (
            <Button
              permissionAction="create"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={ui('إضافة حساب فرعي')}
              aria-label={`${ui('إضافة حساب فرعي')} — ${account.name}`}
              onClick={() => onAdd(account)}
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
            </Button>
          )}
          {canUpdate && (
            <Button
              permissionAction="update"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={ui('تعديل')}
              aria-label={`${ui('تعديل')} — ${account.name}`}
              onClick={() => onEdit(account, depth)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              permissionAction="delete"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={ui('حذف')}
              aria-label={`${ui('حذف')} — ${account.name}`}
              onClick={() => onDelete(account)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {hasChildren &&
        isExpanded &&
        account.children.map((child) => (
          <AccountTreeRow
            key={child.id}
            account={child}
            depth={depth + 1}
            currency={currency}
            expanded={expanded}
            forceExpanded={forceExpanded}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onToggle={onToggle}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

/**
 * Create imported rows parents-first, resolving each row's parent by name against
 * the accounts that already exist plus the ones this import just created.
 */
async function createImportedAccounts(
  rows: ParsedImportAccount[],
  existing: AccountNode[],
): Promise<{ created: number; failed: number }> {
  const idByName = new Map<string, number>();
  for (const account of existing) idByName.set(account.name.trim(), account.id);

  let created = 0;
  let failed = 0;
  // A child can only be posted once its parent has an id, so walk main → sub-main → sub.
  const ordered = [...rows].sort(
    (a, b) =>
      ACCOUNT_LEVEL_ORDER.indexOf(a.accountLevel) - ACCOUNT_LEVEL_ORDER.indexOf(b.accountLevel),
  );
  for (const row of ordered) {
    const parentId = row.parentName ? idByName.get(row.parentName.trim()) : undefined;
    if (row.accountLevel !== 'main' && parentId == null) {
      failed++;
      continue;
    }
    try {
      const { data } = await api.post<{ id: number }>('/accounting/accounts', {
        name: row.name,
        ...(row.accountLevel === 'main' ? { type: row.type } : {}),
        ...(parentId != null ? { parentId } : {}),
        ...(row.category ? { category: row.category } : {}),
        ...(row.description ? { description: row.description } : {}),
      });
      if (data?.id != null) idByName.set(row.name.trim(), data.id);
      created++;
    } catch {
      failed++;
    }
  }
  return { created, failed };
}
