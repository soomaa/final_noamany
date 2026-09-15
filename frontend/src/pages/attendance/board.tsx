import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import { FilterBar } from '@/components/common/filter-bar';
import { MapModal } from '@/components/common/map-modal';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { uploadUrl } from '@/components/employees/use-uploads';
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
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, toWesternDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';

interface AttendanceRow {
  id: number;
  empCode?: string;
  employeeName?: string;
  department?: string;
  jobTitle?: string;
  branchName?: string;
  weekday?: string;
  actionDate?: string;
  checkIn?: string;
  checkOut?: string;
  secondCheckIn?: string;
  secondCheckOut?: string;
  lateMin?: number;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  secondCheckInLat?: number;
  secondCheckInLng?: number;
  secondCheckOutLat?: number;
  secondCheckOutLng?: number;
  checkInPhoto?: string;
  checkOutPhoto?: string;
  secondCheckInPhoto?: string;
  secondCheckOutPhoto?: string;
  workingSeconds?: number;
  isWorking?: boolean;
}

interface ManualEmployee {
  id: number;
  empCode: number | null;
  name: string | null;
  branchId: number | null;
  department: string | null;
  section: string | null;
}

interface ManualOptions {
  branchId: number | null;
  branchLocked: boolean;
  employees: ManualEmployee[];
}

const today = () => new Date().toISOString().slice(0, 10);

function durationText(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
}

function PunchPhoto({ path, label }: { path?: string; label: string }) {
  const src = uploadUrl(path);
  if (!src) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={label}>
      <img
        src={src}
        alt={label}
        className="mx-auto size-[72px] rounded-xl border object-cover shadow-sm transition-transform hover:scale-105"
        loading="lazy"
      />
    </a>
  );
}

export function AttendanceBoardPage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const { params, setParams } = useListQuery({ filters: { date: today() } });
  const { data, isLoading, isError, refetch, dataUpdatedAt } = usePaginatedList<AttendanceRow>('attendance', params);
  const { data: branches = [] } = useBranches();
  const [now, setNow] = useState(Date.now());
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ branchId: '', empCode: '', checkIn: '', checkOut: '', type: 'in' as 'in' | 'out' });
  const manualOptions = useQuery({
    queryKey: ['attendance', 'manual-options', manualForm.branchId, user?.sub],
    queryFn: async () => {
      const { data: response } = await api.get<ManualOptions>('/attendance/manual-options', {
        params: manualForm.branchId ? { branchId: manualForm.branchId } : {},
      });
      return response;
    },
    enabled: manualOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const branchOptions = useMemo(
    () => branches.map((branch) => ({ value: String(branch.id), label: branch.name ?? `#${branch.id}` })),
    [branches],
  );
  const availableBranches = manualOptions.data?.branchLocked && manualOptions.data.branchId
    ? branchOptions.filter((branch) => branch.value === String(manualOptions.data?.branchId))
    : branchOptions;
  const employeeOptions = (manualOptions.data?.employees ?? [])
    .filter((employee) => employee.empCode != null)
    .map((employee) => ({
      value: String(employee.empCode),
      label: `${employee.name ?? '—'} (${employee.empCode})`,
      description: [employee.department, employee.section].filter(Boolean).join(' — '),
      searchText: `${employee.name ?? ''} ${employee.empCode ?? ''}`,
    }));

  useEffect(() => {
    if (!manualOpen || !manualOptions.data?.branchId || manualForm.branchId) return;
    setManualForm((form) => ({ ...form, branchId: String(manualOptions.data?.branchId) }));
  }, [manualForm.branchId, manualOpen, manualOptions.data?.branchId]);

  const submitManual = async () => {
    const empCode = toWesternDigits(manualForm.empCode);
    if (!manualForm.branchId) return toast.error(ui('اختر الفرع'));
    if (!empCode) return toast.error(ui('اختر الموظف'));
    try {
      await api.post('/attendance/check', { ...manualForm, empCode, channel: 'app' });
      toast.success(ui('تم تسجيل البصمة يدويًا'));
      setManualOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const timeCell = (
    value: string | undefined,
    lat: number | undefined,
    lng: number | undefined,
    employeeName: string | undefined,
  ) => value ? (
    <button
      type="button"
      className="nums font-medium text-success hover:underline disabled:cursor-default"
      disabled={lat == null || lng == null}
      onClick={() => lat != null && lng != null && setMapTarget({ lat, lng, name: employeeName })}
    >
      {toArabicDigits(value)}
    </button>
  ) : <span className="text-muted-foreground">—</span>;

  const columns = useMemo<ColumnDef<AttendanceRow>[]>(() => [
    {
      id: 'sequence',
      header: '#',
      cell: ({ row }) => <span className="nums">{toArabicDigits((params.page - 1) * params.pageSize + row.index + 1)}</span>,
    },
    { accessorKey: 'empCode', header: ui('كود الموظف'), cell: ({ getValue }) => <span className="nums text-primary">{toArabicDigits(String(getValue() ?? '—'))}</span> },
    { accessorKey: 'employeeName', header: ui('الاسم'), cell: ({ getValue }) => <span className="font-medium text-primary">{String(getValue() ?? '—')}</span> },
    { accessorKey: 'department', header: ui('الإدارة') },
    { accessorKey: 'jobTitle', header: ui('الوظيفة') },
    { accessorKey: 'branchName', header: ui('الفرع'), cell: ({ getValue }) => <span className="font-medium text-primary">{String(getValue() ?? '—')}</span> },
    { accessorKey: 'weekday', header: ui('اليوم') },
    { accessorKey: 'actionDate', header: ui('تاريخ البصمة'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? '—'))}</span> },
    {
      id: 'checkInPhoto',
      header: ui('صورة الحضور'),
      cell: ({ row }) => <div className="space-y-2"><PunchPhoto path={row.original.checkInPhoto} label={ui('صورة الحضور')} />{row.original.secondCheckInPhoto && <PunchPhoto path={row.original.secondCheckInPhoto} label={ui('صورة الحضور للوردية الثانية')} />}</div>,
    },
    {
      id: 'checkIn',
      header: ui('وقت الحضور'),
      cell: ({ row }) => <div className="flex min-h-[72px] flex-col items-center justify-center gap-12">{timeCell(row.original.checkIn, row.original.checkInLat, row.original.checkInLng, row.original.employeeName)}{row.original.secondCheckIn && timeCell(row.original.secondCheckIn, row.original.secondCheckInLat, row.original.secondCheckInLng, row.original.employeeName)}</div>,
    },
    {
      id: 'checkOutPhoto',
      header: ui('صورة الانصراف'),
      cell: ({ row }) => <div className="space-y-2"><PunchPhoto path={row.original.checkOutPhoto} label={ui('صورة الانصراف')} />{row.original.secondCheckOutPhoto && <PunchPhoto path={row.original.secondCheckOutPhoto} label={ui('صورة الانصراف للوردية الثانية')} />}</div>,
    },
    {
      id: 'checkOut',
      header: ui('وقت الانصراف'),
      cell: ({ row }) => <div className="flex min-h-[72px] flex-col items-center justify-center gap-12">{timeCell(row.original.checkOut, row.original.checkOutLat, row.original.checkOutLng, row.original.employeeName)}{row.original.secondCheckOut && timeCell(row.original.secondCheckOut, row.original.secondCheckOutLat, row.original.secondCheckOutLng, row.original.employeeName)}</div>,
    },
    { accessorKey: 'lateMin', header: ui('التأخير (د)'), cell: ({ getValue }) => <span className="nums text-destructive underline">{toArabicDigits(String(Math.max(0, Number(getValue() ?? 0))))}</span> },
    {
      id: 'workingHours',
      header: ui('ساعات العمل'),
      cell: ({ row }) => {
        const elapsedSinceFetch = row.original.isWorking ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : 0;
        return <span className={`nums inline-flex rounded-md border px-3 py-2 font-semibold ${row.original.isWorking ? 'border-info/30 bg-info/10 text-info' : 'bg-muted text-muted-foreground'}`}>{row.original.isWorking && <span className="me-2 size-2 animate-pulse rounded-full bg-success" />}{toArabicDigits(durationText((row.original.workingSeconds ?? 0) + elapsedSinceFetch))}</span>;
      },
    },
  ], [dataUpdatedAt, now, params.page, params.pageSize, ui]);

  return <div className="space-y-4">
    <PageHeader
      title={`${ui('متابعة البصمة اليوم')} ${toArabicDigits(params.filters.date ?? today())}`}
      description={ui('عرض صور وأوقات الحضور والانصراف وساعات العمل اليومية')}
      actions={<Button onClick={() => setManualOpen(true)}><Plus className="size-4" />{ui('تسجيل يدوي')}</Button>}
    />
    <FilterBar
      searchPlaceholder={ui('بحث بالاسم أو كود الموظف…')}
      fields={[{ key: 'branchId', label: ui('فلترة حسب الفرع'), type: 'select', options: branchOptions, placeholder: ui('عرض جميع الفروع') }]}
    />
    <DataTable
      columns={columns}
      data={data?.data ?? []}
      total={data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      emptyTitle={ui('لا يوجد حضور مسجل اليوم')}
      enableExport
    />

    <MapModal open={!!mapTarget} onOpenChange={(open) => !open && setMapTarget(null)} lat={mapTarget?.lat} lng={mapTarget?.lng} employeeName={mapTarget?.name} />

    <Dialog open={manualOpen} onOpenChange={(open) => {
      setManualOpen(open);
      if (!open) setManualForm({ branchId: '', empCode: '', checkIn: '', checkOut: '', type: 'in' });
    }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{ui('تسجيل حضور / انصراف يدوي')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{ui('الفرع')}</Label>
            <Combobox
              className="mt-1.5"
              value={manualForm.branchId}
              options={availableBranches}
              placeholder={ui('اختر الفرع')}
              searchPlaceholder={ui('بحث في الفروع…')}
              disabled={manualOptions.data?.branchLocked || manualOptions.isLoading}
              onValueChange={(branchId) => setManualForm((form) => ({ ...form, branchId, empCode: '' }))}
            />
          </div>
          <div>
            <Label>{ui('الموظف')}</Label>
            <Combobox
              className="mt-1.5"
              value={manualForm.empCode}
              options={employeeOptions}
              placeholder={manualForm.branchId ? ui('اختر الموظف') : ui('اختر الفرع أولًا')}
              searchPlaceholder={ui('بحث باسم الموظف أو الكود…')}
              emptyText={ui('لا يوجد موظفون تابعون لهذا الفرع')}
              disabled={!manualForm.branchId || manualOptions.isLoading}
              onValueChange={(empCode) => setManualForm((form) => ({ ...form, empCode }))}
            />
          </div>
          <div><Label>{ui('نوع التسجيل')}</Label><select className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={manualForm.type} onChange={(event) => setManualForm((form) => ({ ...form, type: event.target.value as 'in' | 'out' }))}><option value="in">{ui('حضور')}</option><option value="out">{ui('انصراف')}</option></select></div>
          <div><Label>{ui('وقت الحضور')}</Label><Time12Input className="mt-1.5" value={manualForm.checkIn} onValueChange={(value) => setManualForm((form) => ({ ...form, checkIn: value }))} /></div>
          <div><Label>{ui('وقت الانصراف')}</Label><Time12Input className="mt-1.5" value={manualForm.checkOut} onValueChange={(value) => setManualForm((form) => ({ ...form, checkOut: value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setManualOpen(false)}>{ui('إلغاء')}</Button><Button onClick={() => void submitManual()}><MapPin className="size-4" />{ui('حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
