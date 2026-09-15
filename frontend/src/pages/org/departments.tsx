import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Download,
  Layers3,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { downloadExcel } from '@/lib/export';
import type { DeptNode, JobTitle } from '@/types/org';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

function flattenDeptOptions(nodes: DeptNode[], depth = 0): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const pad = depth > 0 ? '— '.repeat(depth) : '';
  for (const n of nodes) {
    out.push({ value: String(n.id), label: `${pad}${n.title ?? '—'}` });
    if (n.children?.length) out.push(...flattenDeptOptions(n.children, depth + 1));
  }
  return out;
}

function flattenDepartments(
  nodes: DeptNode[],
  parentTitle = '—',
  depth = 0,
): Array<DeptNode & { parentTitle: string; depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, parentTitle, depth },
    ...flattenDepartments(node.children ?? [], node.title ?? '—', depth + 1),
  ]);
}

function filterDepartmentTree(nodes: DeptNode[], rawQuery: string): DeptNode[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterDepartmentTree(node.children ?? [], query);
    const haystack = (node.title ?? '').toLocaleLowerCase();
    return haystack.includes(query) || children.length ? [{ ...node, children }] : [];
  });
}

function descendantIds(node: DeptNode): Set<number> {
  const ids = new Set<number>();
  const visit = (children: DeptNode[]) => {
    for (const child of children) {
      ids.add(child.id);
      visit(child.children ?? []);
    }
  };
  visit(node.children ?? []);
  return ids;
}

type ExpansionMode = 'default' | 'expanded' | 'collapsed';
type OrgItemType = 'department' | 'section';

function DeptTreeNode({
  node,
  depth = 0,
  onEdit,
  onDelete,
  onCreateChild,
  expansionMode,
  expansionRevision,
  searchActive,
}: {
  node: DeptNode;
  depth?: number;
  onEdit: (node: DeptNode) => void;
  onDelete: (node: DeptNode) => void;
  onCreateChild: (node: DeptNode) => void;
  expansionMode: ExpansionMode;
  expansionRevision: number;
  searchActive: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isDepartment = depth === 0;

  useEffect(() => {
    if (expansionMode === 'expanded') setOpen(true);
    if (expansionMode === 'collapsed') setOpen(false);
  }, [expansionMode, expansionRevision]);

  const effectiveOpen = searchActive || open;

  return (
    <div>
      <div
        className={cn('flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:border-border/70 hover:bg-muted/60', depth === 0 && 'font-medium')}
        style={{ paddingInlineStart: 12 + depth * 20 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          aria-expanded={hasChildren ? effectiveOpen : undefined}
        >
          {hasChildren ? (
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !effectiveOpen && '-rotate-90 rtl:rotate-90')} />
          ) : (
            <Network className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{node.title ?? '—'}</span>
          <span className={cn('hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex', isDepartment ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            {uiStatic(isDepartment ? 'إدارة' : 'قسم')}
          </span>
        </button>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" aria-label={uiStatic('إضافة قسم تابع')} onClick={() => onCreateChild(node)}>
            <Plus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={uiStatic('تعديل')} onClick={() => onEdit(node)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={uiStatic('حذف')} onClick={() => void onDelete(node)}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {effectiveOpen && hasChildren && (
        <div className="border-s border-border/60 ms-6">
          {node.children!.map((c) => (
            <DeptTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
              expansionMode={expansionMode}
              expansionRevision={expansionRevision}
              searchActive={searchActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgDepartmentsPage() {
  const { ui } = useLocale();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: async () => {
      const { data: tree } = await api.get<DeptNode[]>('/departments/tree');
      return tree;
    },
    retry: false,
  });

  const { data: jobTitles, isLoading: jobsLoading } = useQuery({
    queryKey: ['departments', 'job-titles'],
    queryFn: async () => {
      const { data: jobs } = await api.get<JobTitle[]>('/departments/job-titles');
      return jobs;
    },
    retry: false,
  });

  const parentOptions = useMemo(() => {
    const opts = flattenDeptOptions(data ?? []);
    return [{ value: '0', label: ui('— بدون أب (جذر) —') }, ...opts];
  }, [data]);

  const flatDepartments = useMemo(() => flattenDepartments(data ?? []), [data]);
  const departmentNameById = useMemo(
    () => new Map(flatDepartments.map((node) => [node.id, node.title ?? '—'])),
    [flatDepartments],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<{ title: string; parentId: string; itemType: OrgItemType }>({
    title: '',
    parentId: '0',
    itemType: 'department',
  });
  const [treeQuery, setTreeQuery] = useState('');
  const [expansionMode, setExpansionMode] = useState<ExpansionMode>('default');
  const [expansionRevision, setExpansionRevision] = useState(0);
  const [exporting, setExporting] = useState(false);

  const applyExpansion = (mode: Exclude<ExpansionMode, 'default'>) => {
    setExpansionMode(mode);
    setExpansionRevision((revision) => revision + 1);
  };

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/departments/${id}`),
    { success: ui('تم حذف الإدارة'), invalidate: ['departments'] },
  );

  const openCreate = (parentId?: number) => {
    setEditId(null);
    setForm({
      title: '',
      parentId: parentId != null ? String(parentId) : '0',
      itemType: parentId != null ? 'section' : 'department',
    });
    setFormOpen(true);
  };

  const openEdit = (node: DeptNode) => {
    setEditId(node.id);
    setForm({
      title: node.title ?? '',
      parentId: String(node.parentId ?? 0),
      itemType: node.parentId ? 'section' : 'department',
    });
    setFormOpen(true);
  };

  const handleDelete = async (node: DeptNode) => {
    const ok = await confirm({
      title: ui('حذف الإدارة'),
      description: `${ui('هل تريد حذف «')}${node.title ?? ui('هذه الإدارة')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(node.id);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(ui('اسم الإدارة مطلوب'));
      return;
    }
    if (form.itemType === 'section' && (!form.parentId || form.parentId === '0')) {
      toast.error(ui('اختر الإدارة أو القسم الأب'));
      return;
    }
    try {
      const payload = {
        title: form.title.trim(),
        parentId: form.itemType === 'department' ? 0 : parseInt(form.parentId, 10),
      };
      if (editId) await api.patch(`/departments/${editId}`, payload);
      else await api.post('/departments', payload);
      toast.success(ui('تم حفظ الإدارة'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deptCount = useMemo(() => {
    const count = (nodes: DeptNode[]): number =>
      nodes.reduce((s, n) => s + 1 + (n.children ? count(n.children) : 0), 0);
    return data ? count(data) : 0;
  }, [data]);

  const filteredTree = useMemo(() => filterDepartmentTree(data ?? [], treeQuery), [data, treeQuery]);
  const blockedParentIds = useMemo(() => {
    if (!editId) return new Set<number>();
    const editedNode = flatDepartments.find((node) => node.id === editId);
    const ids = editedNode ? descendantIds(editedNode) : new Set<number>();
    ids.add(editId);
    return ids;
  }, [editId, flatDepartments]);
  const selectableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.value !== '0' && !blockedParentIds.has(Number(option.value))),
    [blockedParentIds, parentOptions],
  );

  const exportOrganization = async () => {
    if (!flatDepartments.length) return;
    setExporting(true);
    try {
      const rows = flatDepartments.map((node) => ({
        name: node.title ?? '—',
        type: node.depth === 0 ? ui('إدارة') : ui('قسم'),
        parent: node.parentTitle,
      }));
      await downloadExcel(
        rows,
        [
          { key: 'name', header: ui('الاسم') },
          { key: 'type', header: ui('النوع') },
          { key: 'parent', header: ui('العنصر الأب') },
        ],
        'الهيكل_التنظيمي',
        ui('الهيكل التنظيمي'),
      );
      toast.success(ui('تم تنزيل ملف Excel بنجاح'));
    } catch (exportError) {
      toast.error(apiError(exportError));
    } finally {
      setExporting(false);
    }
  };

  if (isError && isNotImplemented(error)) {
    return (
      <ListPageShell title={ui('إدارة الإدارات والأقسام')} isError error={error}>
        <div />
      </ListPageShell>
    );
  }

  return (
    <>
      <ListPageShell
        title={ui('إدارة الإدارات والأقسام')}
        description={ui('شجرة الإدارات والأقسام والمسميات الوظيفية في مكان واحد')}
        stats={[
          { title: ui('الإدارات والأقسام'), value: toArabicDigits(deptCount) },
          { title: ui('المسميات الوظيفية'), value: toArabicDigits(jobTitles?.length ?? 0) },
        ]}
        statsLoading={isLoading || jobsLoading}
        isError={isError}
        error={error}
        compact
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void exportOrganization()} disabled={!flatDepartments.length || exporting}>
              <Download className="size-4" /> {exporting ? ui('جارٍ التصدير…') : ui('تصدير Excel')}
            </Button>
            <Button variant="brand" size="sm" onClick={() => openCreate()}>
              <Plus className="size-4" /> {ui('إضافة إدارة أو قسم')}
            </Button>
          </>
        }
      >
        <Tabs defaultValue="tree" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tree">{ui('الهيكل التنظيمي')}</TabsTrigger>
            <TabsTrigger value="jobs">{ui('المسميات الوظيفية')}</TabsTrigger>
          </TabsList>

          <TabsContent value="tree">
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-2 border-b bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative min-w-0 flex-1 lg:max-w-md">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={treeQuery}
                    onChange={(event) => setTreeQuery(event.target.value)}
                    className="ps-9"
                    placeholder={ui('بحث باسم الإدارة أو القسم…')}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => applyExpansion('expanded')}>
                    <ChevronsDown className="size-4" /> {ui('فتح الكل')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyExpansion('collapsed')}>
                    <ChevronsUp className="size-4" /> {ui('طي الكل')}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9" aria-label={ui('إعادة تحميل')} onClick={() => void refetch()}>
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="p-3">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !data?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{ui('لا توجد إدارات — ابدأ ببناء الهيكل التنظيمي.')}</p>
              ) : !filteredTree.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{ui('لا توجد نتائج مطابقة للبحث.')}</p>
              ) : (
                <div className="space-y-0.5">
                  {filteredTree.map((node) => (
                    <DeptTreeNode
                      key={node.id}
                      node={node}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onCreateChild={(parent) => openCreate(parent.id)}
                      expansionMode={expansionMode}
                      expansionRevision={expansionRevision}
                      searchActive={Boolean(treeQuery.trim())}
                    />
                  ))}
                </div>
              )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card className="p-4">
              {jobsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !jobTitles?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{ui('لا توجد مسميات وظيفية.')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-3 text-start">{ui('المسمى')}</th>
                        <th className="p-3 text-start">{ui('الكود')}</th>
                        <th className="p-3 text-start">{ui('الإدارة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobTitles.map((j) => (
                        <tr key={j.id} className="border-b border-border/50 even:bg-muted/20">
                          <td className="p-3">{j.name ?? '—'}</td>
                          <td className="p-3 nums">{j.code != null ? toArabicDigits(j.code) : '—'}</td>
                          <td className="p-3">{departmentNameById.get(j.edaraId ?? j.parentId) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل إدارة / قسم') : ui('إدارة / قسم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('النوع')}</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.itemType === 'department' ? 'default' : 'outline'}
                  onClick={() => setForm((current) => ({ ...current, itemType: 'department', parentId: '0' }))}
                >
                  <Building2 className="size-4" /> {ui('إدارة')}
                </Button>
                <Button
                  type="button"
                  variant={form.itemType === 'section' ? 'default' : 'outline'}
                  onClick={() => setForm((current) => ({ ...current, itemType: 'section', parentId: current.parentId === '0' ? '' : current.parentId }))}
                >
                  <Layers3 className="size-4" /> {ui('قسم')}
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="dept-title">{ui('الاسم')}</Label>
              <Input id="dept-title" className="mt-1.5" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            {form.itemType === 'section' && <div>
              <Label>{ui('الإدارة أو القسم الأب')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.parentId}
                  onValueChange={(parentId) => setForm((f) => ({ ...f, parentId }))}
                  options={selectableParentOptions}
                  placeholder={ui('اختر العنصر الأب…')}
                  searchPlaceholder={ui('بحث في الشجرة…')}
                />
              </div>
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
