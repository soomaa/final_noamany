import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Eye, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { MapModal } from '@/components/common/map-modal';
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
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface VisitRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  lat?: number;
  long?: number;
  radius?: number;
}

export function SiteVisitsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<VisitRow>('sites/visits', params);

  const [mapRow, setMapRow] = useState<VisitRow | null>(null);
  const [recordsId, setRecordsId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', siteName: '', lat: '', lng: '', radius: '100' });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['sites/visits', recordsId, 'records'],
    queryFn: async () => {
      const { data: r } = await api.get<Record<string, unknown>[]>(`/sites/visits/${recordsId}/records`);
      return r;
    },
    enabled: recordsId != null,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/sites/visits/${id}`),
    { success: ui('تم حذف الموقع'), invalidate: ['sites/visits'] },
  );

  const stats = useMemo(
    () => [
      { title: ui('مواقع الزيارة'), value: toArabicDigits(data?.total ?? 0), icon: <MapPin className="size-5" /> },
    ],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', siteName: '', lat: '', lng: '', radius: '100' });
    setFormOpen(true);
  };

  const openEdit = (row: VisitRow) => {
    setEditId(row.id);
    setForm({
      name: row.title ?? '',
      siteName: row.employeeName ?? '',
      lat: row.lat != null ? String(row.lat) : '',
      lng: row.long != null ? String(row.long) : '',
      radius: row.radius != null ? String(row.radius) : '100',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.lat || !form.lng) {
      toast.error(ui('الاسم والإحداثيات مطلوبة'));
      return;
    }
    try {
      const payload = {
        name: form.name,
        siteName: form.siteName || undefined,
        lat: parseFloat(form.lat),
        long: parseFloat(form.lng),
        radius: form.radius ? parseInt(form.radius, 10) : 100,
      };
      if (editId) await api.patch(`/sites/visits/${editId}`, payload);
      else await api.post('/sites/visits', payload);
      toast.success(ui('تم حفظ الموقع'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<VisitRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('الاسم') },
    { accessorKey: 'employeeName', header: ui('اسم الموقع'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'lat',
      header: ui('الموقع'),
      cell: ({ row }) =>
        row.original.lat != null ? (
          <Button variant="link" size="sm" className="h-auto p-0 nums" onClick={() => setMapRow(row.original)}>
            <MapPin className="size-3.5" />
            {toArabicDigits(String(row.original.lat))}, {toArabicDigits(String(row.original.long))}
          </Button>
        ) : (
          '—'
        ),
    },
    {
      accessorKey: 'radius',
      header: ui('نصف القطر (م)'),
      cell: ({ getValue }) => <span className="nums">{getValue() != null ? toArabicDigits(getValue() as number) : '—'}</span>,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('السجلات')} onClick={() => setRecordsId(row.original.id)}>
            <Eye className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف الموقع'),
                description: `${ui('هل تريد حذف «')}${row.original.title ?? ui('هذا الموقع')}${ui('»؟')}`,
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
        title={ui('مواقع الزيارة')}
        description={ui('إدارة مواقع الزيارات والميدان مع السياج الجغرافي')}
        searchPlaceholder={ui('بحث في المواقع…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('موقع جديد')}
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
          emptyTitle={ui('لا توجد مواقع')}
        />
      </ListPageShell>

      <MapModal
        open={!!mapRow}
        onOpenChange={(o) => !o && setMapRow(null)}
        lat={mapRow?.lat}
        lng={mapRow?.long}
        employeeName={mapRow?.title ?? undefined}
      />

      <Sheet open={recordsId != null} onOpenChange={(o) => !o && setRecordsId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{ui('سجلات الزيارة')}</SheetTitle>
            <SheetDescription>{ui('سجلات المهام المرتبطة بهذا الموقع')}</SheetDescription>
          </SheetHeader>
          {recordsLoading ? (
            <div className="mt-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {(records ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد سجلات زيارة.')}</p>
              ) : (
                records!.map((r, i) => (
                  <div key={i} className="rounded-lg border px-3 py-2 text-sm">
                    <p className="font-medium">{(r.emp_name as string) ?? (r.name as string) ?? `${ui('سجل')} #${i + 1}`}</p>
                    {r.date_ar != null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <DateText value={r.date_ar as string} />
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل موقع') : ui('موقع زيارة جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="visit-name">{ui('الاسم')}</Label>
              <Input id="visit-name" className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="visit-site">{ui('اسم الموقع')}</Label>
              <Input id="visit-site" className="mt-1.5" value={form.siteName} onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="visit-lat">{ui('خط العرض')}</Label>
                <Input id="visit-lat" className="mt-1.5 nums" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="visit-lng">{ui('خط الطول')}</Label>
                <Input id="visit-lng" className="mt-1.5 nums" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="visit-radius">{ui('نصف القطر (متر)')}</Label>
              <Input id="visit-radius" type="number" className="mt-1.5 nums" value={form.radius} onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))} />
            </div>
            {form.lat && form.lng && (
              <iframe
                title={ui('معاينة الموقع')}
                src={`https://maps.google.com/maps?q=${form.lat},${form.lng}&hl=ar&z=14&output=embed`}
                className="h-40 w-full rounded-lg border"
              />
            )}
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
