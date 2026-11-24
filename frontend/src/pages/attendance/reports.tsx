import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { PunchPhotoPreview, PunchPhotoThumb, type PunchPhotoItem } from '@/components/attendance/punch-photo-preview';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { downloadExcel, type ExportColumn } from '@/lib/export';
import { usePaginatedList } from '@/lib/api-hooks';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { listQueryToApiParams, useListQuery } from '@/lib/use-list-query';
import { minutesLabel } from '@/lib/minutes';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';

type ReportKind = 'basma' | 'full-sheet' | 'absence' | 'late' | 'overtime' | 'shift-swap';

interface Row {
  id?: number | string;
  empCode?: number;
  empName?: string;
  department?: string;
  section?: string;
  phone?: string;
  jobTitle?: string;
  weekday?: string;
  actionDate?: string;
  checkIn?: string;
  checkOut?: string;
  checkInPhoto?: string;
  checkOutPhoto?: string;
  scheduledIn?: string;
  scheduledOut?: string;
  secondCheckIn?: string;
  secondCheckOut?: string;
  secondCheckInPhoto?: string;
  secondCheckOutPhoto?: string;
  secondLateMin?: number;
  earlyLeaveMin?: number;
  overtimeMin?: number;
  lateMin?: number;
  absenceWithLeave?: number;
  absenceWithoutLeave?: number;
  totalAbsence?: number;
  lateWithPermission?: number;
  lateWithoutPermission?: number;
  totalLate?: number;
  numHours?: number;
  edafaDate?: string;
  publisherName?: string;
  branchTitle?: string;
  sheftDate?: string;
  ttypeName?: string;
  dwamTitle?: string;
  status?: 'present' | 'weekly_off' | 'swapped_leave' | 'approved_leave' | 'absent';
  statusLabel?: string;
  workingSeconds?: number;
  notes?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function photoUrl(value?: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/uploads/${value.replace(/^uploads[\\/]/, '')}`;
}

function absoluteUrl(path?: string) {
  if (!path) return undefined;
  return /^https?:\/\//i.test(path) ? path : `${window.location.origin}${path}`;
}

/** Main punch plus the second-shift punch (legacy shows both in one cell). */
function punchText(main?: string, second?: string) {
  return [main, second].filter(Boolean).join(' / ') || '—';
}

const REPORT_TITLES: Record<ReportKind, string> = {
  basma: 'البصمة خلال فترة',
  'full-sheet': 'شيت البصمة الكامل',
  absence: 'الغياب خلال فترة',
  late: 'التأخيرات خلال فترة',
  'shift-swap': 'تبديل وإضافة وردية',
  overtime: 'الساعات الإضافية',
};

/** Excel columns per report — plain values so the sheet can be sorted and compared. */
const EXCEL_COLUMNS: Record<ReportKind, ExportColumn<Record<string, unknown>>[]> = {
  basma: [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'branchTitle', header: 'الفرع' },
    { key: 'department', header: 'الإدارة' },
    { key: 'jobTitle', header: 'الوظيفة' },
    { key: 'weekday', header: 'اليوم' },
    { key: 'actionDate', header: 'تاريخ البصمة' },
    { key: 'scheduledIn', header: 'موعد الحضور' },
    { key: 'checkIn', header: 'وقت الحضور' },
    { key: 'scheduledOut', header: 'موعد الانصراف' },
    { key: 'checkOut', header: 'وقت الانصراف' },
    { key: 'lateMin', header: 'التأخير بالدقائق' },
    { key: 'earlyLeaveMin', header: 'الانصراف المبكر بالدقائق' },
    { key: 'secondCheckIn', header: 'حضور الشيفت الثاني' },
    { key: 'secondCheckOut', header: 'انصراف الشيفت الثاني' },
    { key: 'secondLateMin', header: 'تأخير الشيفت الثاني بالدقائق' },
    { key: 'checkInPhotoUrl', header: 'صورة الحضور' },
    { key: 'checkOutPhotoUrl', header: 'صورة الانصراف' },
  ],
  'full-sheet': [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'branchTitle', header: 'الفرع' },
    { key: 'weekday', header: 'اليوم' },
    { key: 'actionDate', header: 'التاريخ' },
    { key: 'statusLabel', header: 'الحالة' },
    { key: 'checkIn', header: 'وقت الحضور' },
    { key: 'checkOut', header: 'وقت الانصراف' },
    { key: 'lateMin', header: 'التأخير بالدقائق' },
    { key: 'workingHours', header: 'ساعات العمل' },
  ],
  absence: [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'department', header: 'الإدارة' },
    { key: 'phone', header: 'رقم الهاتف' },
    { key: 'totalAbsence', header: 'عدد مرات الغياب' },
    { key: 'absenceWithLeave', header: 'عدد مرات الإجازات' },
    { key: 'absenceWithoutLeave', header: 'عدد مرات الغياب بدون إجازة' },
  ],
  late: [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'department', header: 'الإدارة' },
    { key: 'phone', header: 'رقم الهاتف' },
    { key: 'lateWithPermission', header: 'دقائق التأخير بإذن' },
    { key: 'lateWithoutPermission', header: 'دقائق التأخير بدون إذن' },
    { key: 'totalLate', header: 'إجمالي التأخير بالدقائق' },
  ],
  'shift-swap': [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'branchTitle', header: 'الفرع' },
    { key: 'sheftDate', header: 'التاريخ' },
    { key: 'ttypeName', header: 'نوع العملية' },
    { key: 'dwamTitle', header: 'الوردية' },
  ],
  overtime: [
    { key: 'empCode', header: 'كود الموظف' },
    { key: 'empName', header: 'اسم الموظف' },
    { key: 'branchTitle', header: 'الفرع' },
    { key: 'weekday', header: 'اليوم' },
    { key: 'edafaDate', header: 'التاريخ' },
    { key: 'numHours', header: 'عدد الساعات' },
    { key: 'publisherName', header: 'القائم بالإضافة' },
  ],
};

function durationText(seconds?: number) {
  if (seconds == null) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function AttendanceReportsPage() {
  const { ui } = useLocale();
  const { pathname } = useLocation();
  const { params, setParams } = useListQuery({
    filters: { dateFrom: today(), dateTo: today(), empCode: 'all', branchId: 'all' },
  });
  const initialKind: ReportKind = pathname.includes('absence')
    ? 'absence'
    : pathname.includes('late')
      ? 'late'
      : pathname.includes('overtime') || pathname.includes('hours')
        ? 'overtime'
        : pathname.includes('shift')
          ? 'shift-swap'
          : 'basma';
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const query = usePaginatedList<Row>(`attendance/reports/${kind}`, params);
  const { data: employees = [] } = useQuery({
    queryKey: ['attendance', 'report-employee-options'],
    queryFn: async () => (await api.get<EmployeeListItem[]>('/employees/pos-options')).data,
    staleTime: 60_000,
  });
  const { data: branches = [] } = useBranches();

  const filteredEmployees = params.filters.branchId && params.filters.branchId !== 'all'
    ? employees.filter((employee) => String(employee.branch_id_fk) === params.filters.branchId)
    : employees;
  const employeeOptions = [
    { value: 'all', label: ui('كل الموظفين') },
    ...filteredEmployees.map((employee) => ({
      value: String(employee.emp_code),
      label: `${employee.employee} (${employee.emp_code})`,
      description: [employee.edara_n, employee.qsm_n].filter(Boolean).join(' — '),
    })),
  ];
  const branchOptions = [
    { value: 'all', label: ui('كل الفروع') },
    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name ?? `#${branch.id}` })),
  ];
  const n = (value: unknown) => <span className="nums">{toArabicDigits(String(value ?? 0))}</span>;
  // Every photo on the current page, in table order, for the preview's arrows.
  const photoItems = useMemo<PunchPhotoItem[]>(() => (query.data?.data ?? []).flatMap((row, index) => {
    if (kind === 'full-sheet' && row.status !== 'present') return [];
    const base = {
      employeeName: row.empName, empCode: row.empCode, department: row.department, jobTitle: row.jobTitle,
      branchName: row.branchTitle, weekday: row.weekday, actionDate: row.actionDate,
    };
    const shots: Array<[string, string | undefined, string, 'in' | 'out', string | undefined]> = [
      ['in1', row.checkInPhoto, 'صورة الحضور', 'in', row.checkIn],
      ['in2', row.secondCheckInPhoto, 'صورة الحضور للوردية الثانية', 'in', row.secondCheckIn],
      ['out1', row.checkOutPhoto, 'صورة الانصراف', 'out', row.checkOut],
      ['out2', row.secondCheckOutPhoto, 'صورة الانصراف للوردية الثانية', 'out', row.secondCheckOut],
    ];
    return shots.flatMap(([slot, path, label, photoKind, time]) => {
      const src = photoUrl(path);
      return src ? [{ ...base, key: `${row.id ?? index}|${slot}`, src, label, kind: photoKind, time, lateMin: slot === 'in1' ? row.lateMin : undefined }] : [];
    });
  }), [kind, query.data]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // Thumbnails like the legacy report; a click opens the preview with the punch details.
  const photo = (row: Row, rowIndex: number, ...slots: Array<[string, string | undefined, string]>) => {
    const shown = slots.filter(([, path]) => photoUrl(path));
    if (!shown.length) return <span>—</span>;
    return <div className="flex flex-col items-center gap-1">
      {shown.map(([slot, path, label]) => <PunchPhotoThumb
        key={slot}
        src={photoUrl(path)}
        label={ui(label)}
        onOpen={() => setPreviewIndex(photoItems.findIndex((item) => item.key === `${row.id ?? rowIndex}|${slot}`))}
      />)}
    </div>;
  };
  const fullSheetContent = (row: Row, value?: string, isPhoto = false, rowIndex = 0, slot = 'in1') => {
    if (row.status !== 'present') {
      const color = row.status === 'absent' ? 'text-destructive' : row.status === 'weekly_off' ? 'text-warning' : 'text-success';
      return <span className={`font-semibold ${color}`}>{ui(row.statusLabel ?? '—')}</span>;
    }
    if (!isPhoto) return value ? <span className="nums">{toArabicDigits(value)}</span> : <span>—</span>;
    return photo(row, rowIndex, [slot, value, slot === 'in1' ? 'صورة الحضور' : 'صورة الانصراف']);
  };
  const remove = async (path: string, id?: number) => {
    if (!id || !window.confirm(ui('هل تريد حذف السجل؟'))) return;
    try {
      await api.delete(`${path}/${id}`);
      toast.success(ui('تم حذف السجل'));
      void query.refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const exportExcel = async () => {
    try {
      // fetchAllReportRows overrides page/pageSize, so every page in the filtered range is exported.
      const rows = await fetchAllReportRows<Row>(`/attendance/reports/${kind}`, listQueryToApiParams(params), 500);
      if (!rows.length) {
        toast.info(ui('لا توجد بيانات في الفترة المحددة'));
        return;
      }
      const sheetRows = rows.map((row) => ({
        ...row,
        statusLabel: row.statusLabel ? ui(row.statusLabel) : undefined,
        workingHours: row.status === 'present' ? durationText(row.workingSeconds) : undefined,
        checkInPhotoUrl: absoluteUrl(photoUrl(row.checkInPhoto)),
        checkOutPhotoUrl: absoluteUrl(photoUrl(row.checkOutPhoto)),
      })) as Record<string, unknown>[];
      const range = `${params.filters.dateFrom ?? ''}_${params.filters.dateTo ?? ''}`;
      await downloadExcel(sheetRows, EXCEL_COLUMNS[kind], `${REPORT_TITLES[kind]} ${range}.xlsx`, REPORT_TITLES[kind], { rightToLeft: true });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [
      { accessorKey: 'empCode', header: ui('كود الموظف'), cell: ({ getValue }) => n(getValue()) },
      { accessorKey: 'empName', header: ui('اسم الموظف') },
    ];
    if (kind === 'basma') return [
      ...base,
      { accessorKey: 'department', header: ui('الإدارة') },
      { accessorKey: 'jobTitle', header: ui('الوظيفة') },
      { accessorKey: 'weekday', header: ui('اليوم') },
      { accessorKey: 'actionDate', header: ui('تاريخ البصمة') },
      { accessorKey: 'checkInPhoto', header: ui('صورة الحضور'), cell: ({ row }) => photo(row.original, row.index, ['in1', row.original.checkInPhoto, 'صورة الحضور'], ['in2', row.original.secondCheckInPhoto, 'صورة الحضور للوردية الثانية']) },
      { accessorKey: 'checkIn', header: ui('وقت الحضور'), cell: ({ row }) => punchText(row.original.checkIn, row.original.secondCheckIn) },
      { accessorKey: 'checkOutPhoto', header: ui('صورة الانصراف'), cell: ({ row }) => photo(row.original, row.index, ['out1', row.original.checkOutPhoto, 'صورة الانصراف'], ['out2', row.original.secondCheckOutPhoto, 'صورة الانصراف للوردية الثانية']) },
      { accessorKey: 'checkOut', header: ui('وقت الانصراف'), cell: ({ row }) => punchText(row.original.checkOut, row.original.secondCheckOut) },
      { accessorKey: 'lateMin', header: ui('التأخير'), cell: ({ getValue }) => <span className="nums">{minutesLabel(getValue() as number | undefined)}</span> },
    ];
    if (kind === 'full-sheet') return [
      { id: 'sequence', header: '#', cell: ({ row }) => n(((params.page - 1) * params.pageSize) + row.index + 1) },
      ...base,
      { accessorKey: 'branchTitle', header: ui('الفرع') },
      { accessorKey: 'weekday', header: ui('اليوم') },
      { accessorKey: 'actionDate', header: ui('التاريخ'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? '—'))}</span> },
      { accessorKey: 'checkInPhoto', header: ui('صورة الحضور'), cell: ({ row }) => fullSheetContent(row.original, row.original.checkInPhoto, true, row.index, 'in1') },
      { accessorKey: 'checkIn', header: ui('وقت الحضور'), cell: ({ row }) => fullSheetContent(row.original, row.original.checkIn) },
      { accessorKey: 'checkOutPhoto', header: ui('صورة الانصراف'), cell: ({ row }) => fullSheetContent(row.original, row.original.checkOutPhoto, true, row.index, 'out1') },
      { accessorKey: 'checkOut', header: ui('وقت الانصراف'), cell: ({ row }) => fullSheetContent(row.original, row.original.checkOut) },
      { accessorKey: 'lateMin', header: ui('التأخير'), cell: ({ row }) => row.original.status === 'present' ? <span className="nums">{minutesLabel(row.original.lateMin)}</span> : <span>—</span> },
      { accessorKey: 'workingSeconds', header: ui('ساعات العمل'), cell: ({ row }) => row.original.status === 'present' ? <span className="nums rounded bg-info/10 px-2 py-1 text-info">{toArabicDigits(durationText(row.original.workingSeconds))}</span> : <span>—</span> },
    ];
    if (kind === 'absence') return [
      ...base,
      { accessorKey: 'department', header: ui('الإدارة') },
      { accessorKey: 'phone', header: ui('رقم الهاتف') },
      { accessorKey: 'totalAbsence', header: ui('عدد مرات الغياب'), cell: ({ getValue }) => n(getValue()) },
      { accessorKey: 'absenceWithLeave', header: ui('عدد مرات الإجازات'), cell: ({ getValue }) => n(getValue()) },
      { accessorKey: 'absenceWithoutLeave', header: ui('عدد مرات الغياب بدون إجازة'), cell: ({ getValue }) => n(getValue()) },
    ];
    if (kind === 'late') return [
      ...base,
      { accessorKey: 'department', header: ui('الإدارة') },
      { accessorKey: 'phone', header: ui('رقم الهاتف') },
      { accessorKey: 'lateWithPermission', header: ui('التأخير بإذن'), cell: ({ getValue }) => <span className="nums">{minutesLabel(getValue() as number | undefined)}</span> },
      { accessorKey: 'lateWithoutPermission', header: ui('التأخير بدون إذن'), cell: ({ getValue }) => <span className="nums">{minutesLabel(getValue() as number | undefined)}</span> },
      { accessorKey: 'totalLate', header: ui('إجمالي التأخير'), cell: ({ getValue }) => <span className="nums font-medium">{minutesLabel(getValue() as number | undefined)}</span> },
    ];
    if (kind === 'overtime') return [
      ...base,
      { accessorKey: 'branchTitle', header: ui('الفرع') },
      { accessorKey: 'weekday', header: ui('اليوم') },
      { accessorKey: 'edafaDate', header: ui('التاريخ') },
      { accessorKey: 'numHours', header: ui('عدد الساعات'), cell: ({ getValue }) => n(getValue()) },
      { accessorKey: 'publisherName', header: ui('القائم بالإضافة') },
      { id: 'actions', header: ui('الإجراء'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/extra-hours', typeof row.original.id === 'number' ? row.original.id : undefined)}>{ui('حذف')}</Button> },
    ];
    return [
      ...base,
      { accessorKey: 'branchTitle', header: ui('الفرع') },
      { accessorKey: 'sheftDate', header: ui('التاريخ') },
      { accessorKey: 'ttypeName', header: ui('نوع العملية') },
      { accessorKey: 'dwamTitle', header: ui('الوردية') },
      { id: 'actions', header: ui('الإجراء'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/shift-swaps', typeof row.original.id === 'number' ? row.original.id : undefined)}>{ui('حذف')}</Button> },
    ];
  }, [kind, params.page, params.pageSize, photoItems, ui]);

  return <div className="space-y-6">
    <PageHeader title={ui('تقارير الحضور والانصراف')} description={ui('البصمة والغياب والتأخير والإضافي وتبديل الورديات')} />
    <Tabs value={kind} onValueChange={(value) => { setKind(value as ReportKind); setParams({ page: 1 }); }}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="basma">{ui('البصمة خلال فترة')}</TabsTrigger>
        <TabsTrigger value="full-sheet">{ui('شيت البصمة الكامل')}</TabsTrigger>
        <TabsTrigger value="absence">{ui('الغياب خلال فترة')}</TabsTrigger>
        <TabsTrigger value="late">{ui('التأخيرات خلال فترة')}</TabsTrigger>
        <TabsTrigger value="shift-swap">{ui('تبديل وإضافة وردية')}</TabsTrigger>
        <TabsTrigger value="overtime">{ui('الساعات الإضافية')}</TabsTrigger>
      </TabsList>
    </Tabs>
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-6">
      <div className="space-y-1"><Label>{ui('الفرع')}</Label><Combobox value={params.filters.branchId} options={branchOptions} placeholder={ui('كل الفروع')} searchPlaceholder={ui('بحث في الفروع…')} onValueChange={(branchId) => setParams({ page: 1, filters: { branchId, empCode: 'all' } })} /></div>
      <div className="space-y-1"><Label>{ui('الموظف')}</Label><Combobox value={params.filters.empCode} options={employeeOptions} placeholder={ui('كل الموظفين')} searchPlaceholder={ui('بحث بالاسم أو الكود…')} onValueChange={(empCode) => setParams({ page: 1, filters: { empCode } })} /></div>
      <div className="space-y-1"><Label>{ui('من تاريخ')}</Label><Input type="date" value={params.filters.dateFrom ?? ''} onChange={(event) => setParams({ page: 1, filters: { dateFrom: event.target.value } })} /></div>
      <div className="space-y-1"><Label>{ui('إلى تاريخ')}</Label><Input type="date" value={params.filters.dateTo ?? ''} onChange={(event) => setParams({ page: 1, filters: { dateTo: event.target.value } })} /></div>
      <div className="space-y-1"><Label>{ui('بحث')}</Label><Input value={params.search} placeholder={ui('الاسم أو الكود أو الإدارة…')} onChange={(event) => setParams({ page: 1, search: event.target.value })} /></div>
      <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => window.print()}>{ui('طباعة التقرير')}</Button></div>
    </div>
    <DataTable
      columns={columns}
      data={query.data?.data ?? []}
      total={query.data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      onExportExcel={exportExcel}
      emptyTitle={ui('لا توجد بيانات في الفترة المحددة')}
    />
    <PunchPhotoPreview
      items={photoItems}
      index={previewIndex != null && previewIndex >= 0 ? previewIndex : null}
      onIndexChange={setPreviewIndex}
    />
  </div>;
}
