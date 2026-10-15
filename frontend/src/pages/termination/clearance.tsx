import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Eye, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import type { DeptNode } from '@/types/org';

interface ClearanceRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

interface ClearanceLine {
  id?: number;
  adminstrationId?: string;
  responsibleEmpId?: string;
  notes?: string;
  resignation?: string;
  employeeCard?: string;
  medicalCard?: string;
  socialInsurance?: string;
}

interface ClearanceGroup {
  id: number;
  empId?: number;
  employeeName?: string;
  lines?: ClearanceLine[];
}

interface LineDraft {
  adminstrationId: string;
  responsibleEmpId: string;
  notes: string;
}

const LINE_LABELS: Record<string, string> = {
  resignation: uiStatic('الاستقالة'),
  employeeCard: uiStatic('بطاقة الموظف'),
  medicalCard: uiStatic('البطاقة الطبية'),
  socialInsurance: uiStatic('التأمينات'),
};

const EMPTY_LINE = (): LineDraft => ({ adminstrationId: '', responsibleEmpId: '', notes: '' });

function flattenDeptOptions(nodes: DeptNode[], depth = 0): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const pad = depth > 0 ? '— '.repeat(depth) : '';
  for (const n of nodes) {
    out.push({ value: String(n.id), label: `${pad}${n.title ?? '—'}` });
    if (n.children?.length) out.push(...flattenDeptOptions(n.children, depth + 1));
  }
  return out;
}

export function ClearancePage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('termination.clearance:create');
  const canUpdate = can('termination.clearance:update');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClearanceRow>('termination/clearance', params);
  const { data: employees = [] } = useEmployeeOptions(canCreate || canUpdate);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ empId: '', lastWorkingDate: '' });
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE()]);

  const { data: deptTree = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: async () => {
      const { data: tree } = await api.get<DeptNode[]>('/departments/tree');
      return tree;
    },
    enabled: formOpen,
    staleTime: 60_000,
  });
  const deptOptions = useMemo(() => flattenDeptOptions(deptTree), [deptTree]);

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['termination/clearance', groupId],
    queryFn: async () => {
      const { data: g } = await api.get<ClearanceGroup>(`/termination/clearance/${groupId}`);
      return g;
    },
    enabled: groupId != null,
  });

  const stats = useMemo(
    () => [
      { title: ui('طلبات إخلاء الطرف'), value: toArabicDigits(data?.total ?? 0), icon: <ClipboardList className="size-5" /> },
      {
        title: ui('إجمالي الأقسام (هذه الصفحة)'),
        value: toArabicDigits((data?.data ?? []).reduce((s, r) => s + parseInt(r.employeeName ?? '0', 10), 0)),
        icon: <Layers className="size-5" />,
      },
    ],
    [data],
  );

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId(null);
    setForm({ empId: '', lastWorkingDate: '' });
    setLines([EMPTY_LINE()]);
    setFormOpen(true);
  };

  const openEdit = async (row: ClearanceRow) => {
    if (!canUpdate) return;
    setEditingId(row.id);
    setForm({ empId: '', lastWorkingDate: '' });
    setLines([EMPTY_LINE()]);
    setFormOpen(true);
    try {
      const { data: detail } = await api.get<ClearanceGroup>(`/termination/clearance/${row.id}`);
      setForm({
        empId: detail.empId != null ? String(detail.empId) : '',
        lastWorkingDate: '',
      });
      setLines(
        (detail.lines ?? []).length
          ? (detail.lines ?? []).map((line) => ({
              adminstrationId: line.adminstrationId ?? '',
              responsibleEmpId: line.responsibleEmpId && line.responsibleEmpId !== '0' ? line.responsibleEmpId : '',
              notes: line.notes ?? '',
            }))
          : [EMPTY_LINE()],
      );
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const setLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const save = async () => {
    if (editingId ? !canUpdate : !canCreate) return;
    if (!form.empId) {
      toast.error(ui('يرجى اختيار الموظف'));
      return;
    }
    const payloadLines = lines
      .filter((line) => line.adminstrationId.trim())
      .map((line) => ({
        adminstrationId: line.adminstrationId.trim(),
        responsibleEmpId: line.responsibleEmpId || undefined,
        notes: line.notes.trim() || undefined,
      }));
    if (!payloadLines.length) {
      toast.error(ui('أضف إدارة واحدة على الأقل'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empId: Number(form.empId),
        lines: payloadLines,
        lastWorkingDate: form.lastWorkingDate || undefined,
        completed: true,
      };
      if (editingId) await api.patch(`/termination/clearance/${editingId}`, payload);
      else await api.post('/termination/clearance', payload);
      toast.success(editingId ? ui('تم تحديث إخلاء الطرف') : ui('تم إنشاء إخلاء الطرف واكتمال الخروج'));
      setFormOpen(false);
      await refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ClearanceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('رقم المجموعة'),
      cell: ({ row, getValue }) => (
        <button
          type="button"
          className="nums font-medium text-primary hover:underline"
          onClick={() => setGroupId(row.original.id)}
        >
          {formatDigits(getValue() as number)}
        </button>
      ),
    },
    {
      accessorKey: 'title',
      header: ui('الموظف'),
      cell: ({ row, getValue }) => (
        <button type="button" className="text-start hover:underline" onClick={() => setGroupId(row.original.id)}>
          {(getValue() as string | undefined) ?? '—'}
        </button>
      ),
    },
    {
      accessorKey: 'employeeName',
      header: ui('عدد الإدارات'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string ?? '0')}</span>,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('عرض التفاصيل')} onClick={() => setGroupId(row.original.id)}>
            <Eye className="size-4" />
          </Button>
          {canUpdate ? (
            <Button
              permissionResource="termination.clearance"
              permissionAction="update"
              variant="ghost"
              size="icon"
              aria-label={ui('تعديل')}
              onClick={() => void openEdit(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('إخلاء طرف')}
        description={ui('إنشاء إخلاء الطرف يُكمل خروج الموظف من الخدمة ويُخرجه من مسير الرواتب. حدّد آخر يوم عمل والإدارات المسؤولة.')}
        searchPlaceholder={ui('بحث باسم الموظف…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          canCreate ? (
            <Button permissionResource="termination.clearance" permissionAction="create" variant="brand" size="sm" onClick={openCreate}>
              <Plus className="size-4" /> {ui('إخلاء طرف جديد')}
            </Button>
          ) : undefined
        }
      >
        <DataTable
          exportSource={{ resource: 'termination/clearance', params }}
          columns={columns}
          data={data?.data ?? []}
          total={data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          emptyTitle={ui('لا توجد طلبات إخلاء طرف')}
        />
      </ListPageShell>

      <Dialog open={formOpen && (editingId ? canUpdate : canCreate)} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined} size="lg">
          <DialogHeader>
            <DialogTitle>{editingId ? ui('تعديل إخلاء الطرف') : ui('إخلاء طرف جديد')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {ui('حفظ الطلب يُعلّم الموظف كخارج من الخدمة ويُخرجه من المسير. آخر يوم عمل يُستخدم لتاريخ الخروج.')}
          </p>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{ui('الموظف')}</Label>
              <Combobox
                options={employees}
                value={form.empId}
                onValueChange={(empId) => setForm((current) => ({ ...current, empId }))}
                placeholder={ui('اختر الموظف')}
                searchPlaceholder={ui('بحث في الموظفين…')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="clearance-last-day">{ui('آخر يوم عمل')}</Label>
              <Input
                id="clearance-last-day"
                type="date"
                value={form.lastWorkingDate}
                onChange={(event) => setForm((current) => ({ ...current, lastWorkingDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>{ui('إدارات إخلاء الطرف')}</Label>
                <Button permissionAction={null} type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, EMPTY_LINE()])}>
                  <Plus className="size-4" /> {ui('إضافة إدارة')}
                </Button>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>{ui('الإدارة')}</Label>
                    {deptOptions.length ? (
                      <Combobox
                        options={deptOptions}
                        value={line.adminstrationId}
                        onValueChange={(adminstrationId) => setLine(index, { adminstrationId })}
                        placeholder={ui('اختر الإدارة')}
                        searchPlaceholder={ui('بحث في الإدارات…')}
                      />
                    ) : (
                      <Input
                        value={line.adminstrationId}
                        onChange={(event) => setLine(index, { adminstrationId: event.target.value })}
                        placeholder={ui('رقم الإدارة')}
                      />
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{ui('المسؤول')}</Label>
                    <Combobox
                      options={employees}
                      value={line.responsibleEmpId}
                      onValueChange={(responsibleEmpId) => setLine(index, { responsibleEmpId })}
                      placeholder={ui('اختياري')}
                      searchPlaceholder={ui('بحث في الموظفين…')}
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>{ui('ملاحظات')}</Label>
                    <Input value={line.notes} onChange={(event) => setLine(index, { notes: event.target.value })} />
                  </div>
                  <Button
                    permissionAction={null}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={ui('حذف السطر')}
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              permissionResource="termination.clearance"
              permissionAction={editingId ? 'update' : 'create'}
              disabled={saving}
              onClick={() => void save()}
            >
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={groupId != null} onOpenChange={(o) => !o && setGroupId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{ui('إخلاء طرف')} — {group?.employeeName ?? '…'}</SheetTitle>
            <SheetDescription>
              {ui('مجموعة رقم')} <span className="nums">{groupId != null ? toArabicDigits(groupId) : ''}</span>
            </SheetDescription>
          </SheetHeader>
          {groupLoading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : group ? (
            <div className="mt-6 space-y-3">
              {(group.lines ?? []).map((line) => (
                <div key={line.id} className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">{ui('إدارة:')}<span className="nums">{line.adminstrationId ?? '—'}</span></p>
                  {line.responsibleEmpId && line.responsibleEmpId !== '0' && (
                    <p className="mt-1 text-muted-foreground">
                      {ui('المسؤول:')} <span className="nums">{line.responsibleEmpId}</span>
                    </p>
                  )}
                  {line.notes && <p className="mt-2 text-muted-foreground">{line.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(LINE_LABELS).map(([key, label]) => {
                      const val = line[key as keyof typeof line];
                      if (!val) return null;
                      return (
                        <span key={key} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {label}: {val}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
