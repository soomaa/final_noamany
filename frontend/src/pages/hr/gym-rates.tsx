import type { ColumnDef } from '@tanstack/react-table';
import { Calculator, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface GymRateRow {
  id: number;
  ttype?: string;
  title?: string;
  forUser?: number;
  forGym?: number;
  createdAt?: string;
}

const GYM_TYPES = [
  { value: 'target', label: uiStatic('تارجت') },
  { value: 'proten', label: uiStatic('بروتين') },
  { value: 'classes', label: uiStatic('الكلاسات') },
] as const;

const GYM_TYPE_LABELS = Object.fromEntries(GYM_TYPES.map((t) => [t.value, t.label]));

const gymTypeOf = (row: GymRateRow) => row.ttype ?? row.title ?? '';

const GYM_FORMULAS: Record<string, string> = {
  target: 'اشتراكات التارجت والخزائن المنسوبة للموظف × نسبة الموظف ÷ 100',
  proten: 'مبيعات البروتين المنسوبة للموظف × نسبة الموظف ÷ 100',
  classes: 'قيمة اشتراكات الكلاسات المنسوبة للموظف × نسبة الموظف ÷ 100',
};

export function GymRatesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<GymRateRow>('hr/gym-rates', params);
  const missingTypes = GYM_TYPES.filter((type) => !(data?.data ?? []).some((row) => gymTypeOf(row) === type.value));

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ttype: '', forUser: '', forGym: '' });
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/gym-rates/${id}`),
    { success: ui('تم حذف إعداد الجيم'), invalidate: ['hr/gym-rates'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ttype: missingTypes[0]?.value ?? '', forUser: '', forGym: '' });
    setFormOpen(true);
  };

  const openEdit = (row: GymRateRow) => {
    setEditId(row.id);
    setForm({
      ttype: gymTypeOf(row),
      forUser: row.forUser != null ? String(row.forUser) : '',
      forGym: row.forGym != null ? String(row.forGym) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.ttype) {
      toast.error(ui('يرجى اختيار النوع'));
      return;
    }
    const forUser = Number(form.forUser);
    const forGym = Number(form.forGym);
    if (!Number.isInteger(forUser) || forUser < 0 || forUser > 100 || !Number.isInteger(forGym) || forGym < 0 || forGym > 100) {
      toast.error(ui('نسبة الموظف ونسبة الجيم يجب أن تكونا رقمين صحيحين من 0 إلى 100'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ttype: form.ttype,
        forUser,
        forGym,
      };
      if (editId) await api.patch(`/hr/gym-rates/${editId}`, payload);
      else await api.post('/hr/gym-rates', payload);
      toast.success(ui('تم حفظ إعداد الجيم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: GymRateRow) => {
    const type = gymTypeOf(row);
    const label = (GYM_TYPE_LABELS[type] ?? type) || ui('هذا الإعداد');
    const ok = await confirm({
      title: ui('حذف إعداد الجيم'),
      description: `${ui('هل تريد حذف «')}${label}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<GymRateRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      id: 'ttype',
      accessorFn: (row) => gymTypeOf(row),
      header: ui('النوع'),
      cell: ({ getValue }) => GYM_TYPE_LABELS[getValue() as string] ?? (getValue() as string) ?? '—',
    },
    {
      accessorKey: 'forUser',
      header: ui('نسبة الموظف'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}٪</span> : '—';
      },
    },
    {
      accessorKey: 'forGym',
      header: ui('نسبة الجيم'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}٪</span> : '—';
      },
    },
    {
      id: 'formula',
      header: ui('طريقة الاحتساب في الرواتب'),
      cell: ({ row }) => <span className="max-w-sm whitespace-normal text-xs text-muted-foreground">{ui(GYM_FORMULAS[gymTypeOf(row.original)] ?? '—')}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('إعدادات نسب الجيم')}
        description={ui('نفس إعدادات النظام القديم، وتُطبّق نسبة الموظف مباشرةً عند حساب مسير الرواتب')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('إعدادات نسب الجيم — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate} disabled={!missingTypes.length}>
            <Plus className="size-4" /> {missingTypes.length ? ui('إعداد جديد') : ui('تم إعداد الأنواع الثلاثة')}
          </Button>
        }
        stats={[
          {
            title: ui('إجمالي الإعدادات'),
            value: data?.total ?? 0,
            subtitle: ui('أنواع الخدمات المسجّلة'),
            icon: <Dumbbell className="size-5" />,
          },
        ]}
        statsLoading={isLoading}
      >
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Calculator className="size-5 text-primary" />{ui('طريقة تأثير النسب على مسير الرواتب')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                {GYM_TYPES.map((type) => <div key={type.value} className="rounded-lg border bg-muted/20 p-3"><p className="mb-1 font-bold">{type.label}</p><p className="text-muted-foreground">{ui(GYM_FORMULAS[type.value])}</p></div>)}
              </div>
              <p className="rounded-lg bg-primary/5 p-3 text-muted-foreground">{ui('الراتب يستخدم «نسبة الموظف» فقط لحساب الاستحقاق. «نسبة الجيم» محفوظة كتوزيع خاص بالجيم، والقيمتان مستقلتان كما في النظام القديم؛ لذلك يُسمح مثلًا بقيمة 0% للموظف و0% للجيم في التارجت.')}</p>
            </CardContent>
          </Card>
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
            emptyTitle={ui('لا توجد إعدادات جيم')}
          />
        </div>
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل إعداد الجيم') : ui('إعداد جيم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="gym-type">{ui('النوع')}</Label>
              <Select value={form.ttype} onValueChange={(v) => setForm((f) => ({ ...f, ttype: v }))}>
                <SelectTrigger id="gym-type" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر النوع…')} />
                </SelectTrigger>
                <SelectContent>
                  {(editId ? GYM_TYPES : missingTypes).map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="gym-user">{ui('نسبة الموظف ٪')}</Label>
                <Input
                  id="gym-user"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  className="mt-1.5 nums"
                  value={form.forUser}
                  onChange={(e) => setForm((f) => ({ ...f, forUser: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="gym-gym">{ui('نسبة الجيم ٪')}</Label>
                <Input
                  id="gym-gym"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  className="mt-1.5 nums"
                  value={form.forGym}
                  onChange={(e) => setForm((f) => ({ ...f, forGym: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
