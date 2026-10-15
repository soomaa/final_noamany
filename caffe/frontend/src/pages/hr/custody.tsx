import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Laptop, Pencil, Plus, Trash2, ArrowRightLeft, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
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
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface CustodyRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  num?: number;
  status?: number;
}

interface DeviceNode {
  id: number;
  title: string | null;
  children?: DeviceNode[];
}

function flattenDevices(nodes: DeviceNode[], prefix = ''): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} › ${n.title ?? '—'}` : (n.title ?? '—');
    if (!n.children?.length) {
      out.push({ value: String(n.id), label });
    } else {
      out.push(...flattenDevices(n.children, label));
    }
  }
  return out;
}

const STATUS_OPTIONS = [
  { value: '1', label: uiStatic('مُسلّمة') },
  { value: '0', label: uiStatic('مُسترجعة') },
];

export function CustodyPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<CustodyRow>('hr/custody', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const { data: deviceTree = [] } = useQuery({
    queryKey: ['hr/custody', 'devices'],
    queryFn: async () => {
      const { data: d } = await api.get<DeviceNode[]>('/hr/custody/devices');
      return d;
    },
  });

  const deviceOptions = useMemo(() => flattenDevices(deviceTree), [deviceTree]);

  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ custodyId: '', fromEmpId: '', toEmpId: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    empId: '',
    custodyId: '',
    custodyTitle: '',
    num: '1',
    status: '1',
    dateReceived: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/custody/${id}`),
    { success: ui('تم حذف العهدة'), invalidate: ['hr/custody'] },
  );

  const stats = useMemo(
    () => [{ title: ui('عهد الموظفين'), value: toArabicDigits(data?.total ?? 0), icon: <Laptop className="size-5" /> }],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', custodyId: '', custodyTitle: '', num: '1', status: '1', dateReceived: '' });
    setFormOpen(true);
  };

  const openEdit = (row: CustodyRow) => {
    setEditId(row.id);
    setForm({
      empId: '',
      custodyId: '',
      custodyTitle: row.title ?? '',
      num: row.num != null ? String(row.num) : '1',
      status: row.status != null ? String(row.status) : '1',
      dateReceived: row.createdAt ?? '',
    });
    setFormOpen(true);
  };

  const onDeviceChange = (custodyId: string) => {
    const opt = deviceOptions.find((o) => o.value === custodyId);
    setForm((f) => ({
      ...f,
      custodyId,
      custodyTitle: opt ? opt.label.split(' › ').pop() ?? f.custodyTitle : f.custodyTitle,
    }));
  };

  const save = async () => {
    if (!form.empId || !form.custodyTitle.trim()) {
      toast.error(ui('الموظف وعنوان العهدة مطلوبان'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        custodyId: form.custodyId ? parseInt(form.custodyId, 10) : undefined,
        custodyTitle: form.custodyTitle,
        num: form.num ? parseInt(form.num, 10) : undefined,
        status: form.status ? parseInt(form.status, 10) : undefined,
        dateReceived: form.dateReceived || undefined,
      };
      if (editId) await api.patch(`/hr/custody/${editId}`, payload);
      else await api.post('/hr/custody', payload);
      toast.success(ui('تم حفظ العهدة'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<CustodyRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('العهدة') },
    {
      accessorKey: 'num',
      header: ui('العدد'),
      cell: ({ getValue }) => <span className="nums">{getValue() != null ? toArabicDigits(getValue() as number) : '—'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ui('تاريخ الاستلام'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return <StatusBadge status={v === 1 ? 'approved' : 'pending'} label={v === 1 ? ui('مُسلّمة') : ui('مُسترجعة')} />;
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
            aria-label={ui('نقل')}
            onClick={() => {
              setTransferForm({ custodyId: String(row.original.id), fromEmpId: '', toEmpId: '' });
              setTransferOpen(true);
            }}
          >
            <ArrowRightLeft className="size-4" />
          </Button>
          {row.original.status === 1 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('استرجاع')}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('استرجاع العهدة'),
                  description: ui('تأكيد استرجاع هذه العهدة من الموظف؟ ستتحول حالتها إلى «مُسترجعة».'),
                  confirmLabel: ui('استرجاع'),
                });
                if (!ok) return;
                try {
                  await api.patch(`/hr/custody/${row.original.id}/return`, {});
                  toast.success(ui('تم استرجاع العهدة'));
                  void refetch();
                } catch (e) {
                  toast.error(apiError(e));
                }
              }}
            >
              <Undo2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف العهدة'),
                description: ui('هل تريد حذف هذه العهدة؟'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('عهد الموظفين')}
        description={ui('أجهزة ومعدات مُسلّمة للموظفين')}
        searchPlaceholder={ui('بحث في العهد…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('عهدة جديدة')}
          </Button>
        }
      >
        <DataTable
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
          emptyTitle={ui('لا توجد عهد')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل عهدة') : ui('عهدة جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editId && (
              <div>
                <Label>{ui('الموظف')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.empId}
                    onValueChange={(empId) => setForm((f) => ({ ...f, empId }))}
                    options={empOptions}
                    placeholder={ui('اختر الموظف…')}
                    searchPlaceholder={ui('بحث في الموظفين…')}
                  />
                </div>
              </div>
            )}
            {editId && (
              <div>
                <Label>{ui('الموظف المالك')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.empId}
                    onValueChange={(empId) => setForm((f) => ({ ...f, empId }))}
                    options={empOptions}
                    placeholder={ui('اختر الموظف…')}
                    searchPlaceholder={ui('بحث في الموظفين…')}
                  />
                </div>
              </div>
            )}
            {deviceOptions.length > 0 && (
              <div>
                <Label>{ui('من الكتالوج')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.custodyId}
                    onValueChange={onDeviceChange}
                    options={deviceOptions}
                    placeholder={ui('اختر نوع الجهاز…')}
                    searchPlaceholder={ui('بحث في الأجهزة…')}
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="custody-title">{ui('عنوان العهدة')}</Label>
              <Input id="custody-title" className="mt-1.5" value={form.custodyTitle} onChange={(e) => setForm((f) => ({ ...f, custodyTitle: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="custody-num">{ui('العدد')}</Label>
                <Input id="custody-num" type="number" className="mt-1.5 nums" value={form.num} onChange={(e) => setForm((f) => ({ ...f, num: e.target.value }))} />
              </div>
              <div>
                <Label>{ui('الحالة')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.status}
                    onValueChange={(status) => setForm((f) => ({ ...f, status }))}
                    options={STATUS_OPTIONS}
                    placeholder={ui('الحالة…')}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="custody-date">{ui('تاريخ الاستلام')}</Label>
              <Input id="custody-date" type="date" className="mt-1.5" value={form.dateReceived} onChange={(e) => setForm((f) => ({ ...f, dateReceived: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('نقل العهدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('من موظف')}</Label>
              <div className="mt-1.5">
                <Combobox value={transferForm.fromEmpId} onValueChange={(v) => setTransferForm((f) => ({ ...f, fromEmpId: v }))} options={empOptions} placeholder={ui('المالك الحالي…')} />
              </div>
            </div>
            <div>
              <Label>{ui('إلى موظف')}</Label>
              <div className="mt-1.5">
                <Combobox value={transferForm.toEmpId} onValueChange={(v) => setTransferForm((f) => ({ ...f, toEmpId: v }))} options={empOptions} placeholder={ui('المالك الجديد…')} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              onClick={async () => {
                try {
                  await api.post('/hr/custody/transfer', {
                    custodyId: Number(transferForm.custodyId),
                    fromEmpCode: Number(transferForm.fromEmpId),
                    toEmpCode: Number(transferForm.toEmpId),
                  });
                  toast.success(ui('تم نقل العهدة'));
                  setTransferOpen(false);
                  void refetch();
                } catch (e) {
                  toast.error(apiError(e));
                }
              }}
            >
              {ui('نقل')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
