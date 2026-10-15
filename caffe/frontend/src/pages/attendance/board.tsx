import type { ColumnDef } from '@tanstack/react-table';
import { Clock, MapPin, Plus, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar } from '@/components/common/filter-bar';
import { MapModal } from '@/components/common/map-modal';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getSourceLabel } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, toWesternDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface AttendanceRow {
  id: number;
  empCode?: string;
  employeeName?: string;
  department?: string;
  scheduledIn?: string;
  scheduledOut?: string;
  checkIn?: string;
  checkOut?: string;
  secondCheckIn?: string;
  secondCheckOut?: string;
  lateMin?: number;
  earlyLeaveMin?: number;
  overtimeMin?: number;
  status?: string;
  source?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkInPhoto?: string;
  secondCheckInPhoto?: string;
}

export function AttendanceBoardPage() {
  const { t, ui } = useLocale();
  const sourceKeys = useMemo(() => ['device', 'app', 'gps', 'qr', 'nfc', 'face'] as const, []);
  const sourceOptions = useMemo(
    () => sourceKeys.map((key) => ({ value: key, label: getSourceLabel(t, key) })),
    [sourceKeys, t],
  );
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<AttendanceRow>('attendance', params);
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ empCode: '', checkIn: '', checkOut: '', type: 'in' as 'in' | 'out' });

  const submitManual = async () => {
    const empCode = toWesternDigits(manualForm.empCode);
    if (!empCode) {
      toast.error(ui('كود الموظف مطلوب'));
      return;
    }
    try {
      await api.post('/attendance/check', { ...manualForm, empCode, channel: 'app' });
      toast.success(ui('تم تسجيل الحضور يدوياً'));
      setManualOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<AttendanceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'empCode', header: ui('كود'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string ?? '—')}</span> },
    { accessorKey: 'employeeName', header: ui('الاسم') },
    { accessorKey: 'department', header: ui('الإدارة') },
    {
      accessorKey: 'scheduledIn',
      header: ui('المقرر دخول'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v ? <span className="nums text-muted-foreground">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'checkIn',
      header: ui('الحضور'),
      cell: ({ row }) => {
        const v = row.original.checkIn;
        if (!v) return '—';
        return (
          <div className="space-y-1">
            <button
              type="button"
              className="nums text-primary hover:underline"
              onClick={() =>
                row.original.checkInLat != null &&
                setMapTarget({ lat: row.original.checkInLat!, lng: row.original.checkInLng!, name: row.original.employeeName })
              }
            >
              {toArabicDigits(v)}
            </button>
            {row.original.checkInPhoto && (
              <img src={row.original.checkInPhoto} alt="" className="size-8 rounded object-cover" />
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'checkOut',
      header: ui('الانصراف'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'secondCheckIn',
      header: ui('الشفت الثاني'),
      cell: ({ row }) => {
        if (!row.original.secondCheckIn) return '—';
        return (
          <div className="space-y-1 text-xs">
            <span className="nums">{toArabicDigits(row.original.secondCheckIn)}</span>
            {row.original.secondCheckOut && <span className="nums text-muted-foreground"> — {toArabicDigits(row.original.secondCheckOut)}</span>}
            {row.original.secondCheckInPhoto && <img src={row.original.secondCheckInPhoto} alt="" className="size-8 rounded object-cover" />}
          </div>
        );
      },
    },
    {
      accessorKey: 'lateMin',
      header: ui('تأخير'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null && v > 0 ? <span className="nums text-warning">{toArabicDigits(v)} {ui('د')}</span> : '—';
      },
    },
    {
      accessorKey: 'overtimeMin',
      header: ui('إضافي'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null && v > 0 ? <span className="nums text-success">{toArabicDigits(v)} {ui('د')}</span> : '—';
      },
    },
    {
      accessorKey: 'source',
      header: ui('المصدر'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        return (
          <span className="inline-flex items-center gap-1 text-xs">
            {s === 'app' || s === 'gps' ? <Smartphone className="size-3" /> : <Clock className="size-3" />}
            {getSourceLabel(t, s ?? 'device') || s || ui('بصمة')}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        const key = s === 'late' ? 'late' : s === 'leave' ? 'leave' : s === 'absent' ? 'absent' : 'present';
        return <StatusBadge status={key} />;
      },
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('لوحة الحضور اليومي')} />
        <NotImplementedState title={ui('لوحة الحضور قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('لوحة الحضور اليومي')}
        description={ui('حضور وانصراف — بصمة، تطبيق، GPS، QR، NFC، Face')}
        actions={
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="size-4" /> {ui('تسجيل يدوي')}
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder={ui('بحث بالاسم أو الكود…')}
        fields={[
          { key: 'date', label: ui('التاريخ'), type: 'text', placeholder: 'YYYY-MM-DD' },
          {
            key: 'source',
            label: ui('المصدر'),
            type: 'select',
            options: sourceOptions,
          },
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'present', label: ui('حاضر') },
              { value: 'late', label: ui('متأخر') },
              { value: 'absent', label: ui('غائب') },
              { value: 'leave', label: ui('إجازة') },
            ],
          },
        ]}
      />
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
        emptyTitle={ui('لا يوجد حضور مسجّل')}
        enableExport
      />

      <MapModal
        open={!!mapTarget}
        onOpenChange={(o) => !o && setMapTarget(null)}
        lat={mapTarget?.lat}
        lng={mapTarget?.lng}
        employeeName={mapTarget?.name}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui('تسجيل حضور / انصراف يدوي')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('كود الموظف')}</Label>
              <Input
                className="mt-1.5 nums"
                inputMode="numeric"
                placeholder={ui('رقم الكود من قائمة الموظفين')}
                value={manualForm.empCode}
                onChange={(e) => setManualForm((f) => ({ ...f, empCode: e.target.value }))}
              />
            </div>
            <div>
              <Label>{ui('نوع التسجيل')}</Label>
              <select
                className="mt-1.5 flex h-10 w-full rounded-md border border-input px-3 text-sm"
                value={manualForm.type}
                onChange={(e) => setManualForm((f) => ({ ...f, type: e.target.value as 'in' | 'out' }))}
              >
                <option value="in">{ui('حضور')}</option>
                <option value="out">{ui('انصراف')}</option>
              </select>
            </div>
            <div>
              <Label>{ui('وقت الحضور')}</Label>
              <Time12Input className="mt-1.5" value={manualForm.checkIn} onValueChange={(value) => setManualForm((f) => ({ ...f, checkIn: value }))} />
            </div>
            <div>
              <Label>{ui('وقت الانصراف')}</Label>
              <Time12Input className="mt-1.5" value={manualForm.checkOut} onValueChange={(value) => setManualForm((f) => ({ ...f, checkOut: value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void submitManual()}><MapPin className="size-4" />{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
