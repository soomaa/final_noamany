import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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

function DeptTreeNode({
  node,
  depth = 0,
  onEdit,
  onDelete,
}: {
  node: DeptNode;
  depth?: number;
  onEdit: (node: DeptNode) => void;
  onDelete: (node: DeptNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
          depth === 0 && 'font-medium',
        )}
        style={{ paddingInlineStart: 12 + depth * 20 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          aria-expanded={hasChildren ? open : undefined}
        >
          {hasChildren ? (
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90 rtl:rotate-90')} />
          ) : (
            <Network className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 truncate">{node.title ?? '—'}</span>
          <span className="nums text-xs text-muted-foreground">
            {toArabicDigits(node.fromCode)}–{toArabicDigits(node.toCode)}
          </span>
        </button>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="size-8" aria-label={uiStatic('تعديل')} onClick={() => onEdit(node)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={uiStatic('حذف')} onClick={() => void onDelete(node)}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {open && hasChildren && (
        <div className="border-s border-border/60 ms-6">
          {node.children!.map((c) => (
            <DeptTreeNode key={c.id} node={c} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
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

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', parentId: '0', fromCode: '', toCode: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/departments/${id}`),
    { success: ui('تم حذف الإدارة'), invalidate: ['departments'] },
  );

  const openCreate = (parentId?: number) => {
    setEditId(null);
    setForm({ title: '', parentId: parentId != null ? String(parentId) : '0', fromCode: '', toCode: '' });
    setFormOpen(true);
  };

  const openEdit = (node: DeptNode) => {
    setEditId(node.id);
    setForm({
      title: node.title ?? '',
      parentId: String(node.parentId ?? 0),
      fromCode: String(node.fromCode ?? ''),
      toCode: String(node.toCode ?? ''),
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
    try {
      const payload = {
        title: form.title,
        parentId: parseInt(form.parentId, 10) || 0,
        fromCode: form.fromCode ? parseInt(form.fromCode, 10) : undefined,
        toCode: form.toCode ? parseInt(form.toCode, 10) : undefined,
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
        description={ui('شجرة الإدارات والأقسام مع نطاقات أكواد الموظفين والمسميات الوظيفية')}
        stats={[
          { title: ui('الإدارات والأقسام'), value: toArabicDigits(deptCount) },
          { title: ui('المسميات الوظيفية'), value: toArabicDigits(jobTitles?.length ?? 0) },
        ]}
        statsLoading={isLoading || jobsLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={() => openCreate()}>
            <Plus className="size-4" /> {ui('إدارة / قسم جديد')}
          </Button>
        }
      >
        <Tabs defaultValue="tree" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tree">{ui('الهيكل التنظيمي')}</TabsTrigger>
            <TabsTrigger value="jobs">{ui('المسميات الوظيفية')}</TabsTrigger>
          </TabsList>

          <TabsContent value="tree">
            <Card className="p-4">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !data?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{ui('لا توجد إدارات — ابدأ ببناء الهيكل التنظيمي.')}</p>
              ) : (
                <div className="space-y-0.5">
                  {data.map((node) => (
                    <DeptTreeNode key={node.id} node={node} onEdit={openEdit} onDelete={handleDelete} />
                  ))}
                </div>
              )}
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
                          <td className="p-3 nums">{toArabicDigits(j.edaraId)}</td>
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
              <Label htmlFor="dept-title">{ui('الاسم')}</Label>
              <Input id="dept-title" className="mt-1.5" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>{ui('الإدارة الأب')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.parentId}
                  onValueChange={(parentId) => setForm((f) => ({ ...f, parentId }))}
                  options={parentOptions.filter((o) => !editId || o.value !== String(editId))}
                  placeholder={ui('اختر الإدارة الأب…')}
                  searchPlaceholder={ui('بحث في الشجرة…')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dept-from">{ui('من كود')}</Label>
                <Input id="dept-from" type="number" className="mt-1.5 nums" value={form.fromCode} onChange={(e) => setForm((f) => ({ ...f, fromCode: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="dept-to">{ui('إلى كود')}</Label>
                <Input id="dept-to" type="number" className="mt-1.5 nums" value={form.toCode} onChange={(e) => setForm((f) => ({ ...f, toCode: e.target.value }))} />
              </div>
            </div>
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
