import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';

interface SwapRow { id: number; empCode: number; empName: string; sheftDate: string; ttypeName: string; dwamTitle?: string; }
interface ExtraRow { id: number; empCode: number; empName: string; edafaDate: string; numHours: number; }
interface ShiftOption { id: number; title?: string; hdoorFromTime?: string; ensrafToTime?: string; }

export function AttendanceAdjustmentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const swaps = usePaginatedList<SwapRow>('attendance/shift-swaps', params);
  const extras = usePaginatedList<ExtraRow>('attendance/extra-hours', params);
  const { data: employees = [] } = useQuery({
    queryKey: ['attendance', 'employee-options'],
    queryFn: () => fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200),
    staleTime: 60_000,
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ['attendance', 'shift-options'],
    queryFn: () => fetchAllReportRows<ShiftOption>('/attendance/shifts', {}, 100),
    staleTime: 60_000,
  });
  const [swap, setSwap] = useState({ empId: '', dwamIdFk: '', sheftDate: '', ttype: '1' });
  const [extra, setExtra] = useState({ empId: '', edafaDate: '', numHours: '1' });
  const [saving, setSaving] = useState(false);
  const employeeOptions = employees.map((employee) => ({
    value: String(employee.id),
    label: `${employee.employee} (${employee.emp_code})`,
    description: [employee.edara_n, employee.qsm_n].filter(Boolean).join(' — '),
  }));
  const shiftOptions = shifts.map((shift) => ({
    value: String(shift.id),
    label: shift.title || `${ui('وردية')} #${shift.id}`,
    description: [shift.hdoorFromTime, shift.ensrafToTime].filter(Boolean).join(' — '),
  }));
  const swapEmployee = employees.find((employee) => String(employee.id) === swap.empId);
  const extraEmployee = employees.find((employee) => String(employee.id) === extra.empId);
  const saveSwap = async () => {
    if (!swap.empId || !swap.dwamIdFk || !swap.sheftDate) return toast.error(ui('أكمل بيانات الوردية'));
    setSaving(true);
    try {
      await api.post('/attendance/shift-swaps', { ...swap, empId: Number(swap.empId), dwamIdFk: Number(swap.dwamIdFk), ttype: Number(swap.ttype) });
      toast.success(ui('تم حفظ تعديل الوردية')); setSwap({ empId: '', dwamIdFk: '', sheftDate: '', ttype: '1' }); void swaps.refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  const saveExtra = async () => {
    if (!extra.empId || !extra.edafaDate || !extra.numHours) return toast.error(ui('أكمل بيانات الساعات الإضافية'));
    setSaving(true);
    try {
      await api.post('/attendance/extra-hours', { ...extra, empId: Number(extra.empId), numHours: Number(extra.numHours) });
      toast.success(ui('تم حفظ الساعات الإضافية')); setExtra({ empId: '', edafaDate: '', numHours: '1' }); void extras.refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  const remove = async (path: string, id: number, refresh: () => unknown) => {
    try { await api.delete(`${path}/${id}`); toast.success(ui('تم حذف السجل')); refresh(); } catch (e) { toast.error(apiError(e)); }
  };
  const swapColumns: ColumnDef<SwapRow>[] = [
    { accessorKey: 'empCode', header: ui('الكود'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'empName', header: ui('الموظف') }, { accessorKey: 'sheftDate', header: ui('التاريخ') },
    { accessorKey: 'ttypeName', header: ui('النوع') }, { accessorKey: 'dwamTitle', header: ui('الوردية') },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/shift-swaps', row.original.id, () => swaps.refetch())}>{ui('حذف')}</Button> },
  ];
  const extraColumns: ColumnDef<ExtraRow>[] = [
    { accessorKey: 'empCode', header: ui('الكود'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'empName', header: ui('الموظف') }, { accessorKey: 'edafaDate', header: ui('التاريخ') },
    { accessorKey: 'numHours', header: ui('عدد الساعات'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/extra-hours', row.original.id, () => extras.refetch())}>{ui('حذف')}</Button> },
  ];
  const tableProps = { page: params.page, pageSize: params.pageSize, onPageChange: (page: number) => setParams({ page }), onPageSizeChange: (pageSize: number) => setParams({ pageSize, page: 1 }) };

  return <div className="space-y-6">
    <PageHeader title={ui('تعديلات الحضور والانصراف')} description={ui('تبديل وإضافة الورديات والساعات الإضافية')} />
    <Tabs defaultValue="swaps">
      <TabsList><TabsTrigger value="swaps">{ui('الورديات')}</TabsTrigger><TabsTrigger value="extra">{ui('الساعات الإضافية')}</TabsTrigger></TabsList>
      <TabsContent value="swaps" className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          <div><Label>{ui('الموظف')}</Label><Combobox value={swap.empId} options={employeeOptions} placeholder={ui('اختر الموظف')} searchPlaceholder={ui('ابحث بالاسم أو الكود…')} onValueChange={(empId) => setSwap((x) => ({ ...x, empId }))} /></div>
          <div><Label>{ui('الإدارة')}</Label><Input disabled value={swapEmployee?.edara_n ?? ''} /></div>
          <div><Label>{ui('القسم')}</Label><Input disabled value={swapEmployee?.qsm_n ?? ''} /></div>
          <div><Label>{ui('التاريخ')}</Label><Input type="date" value={swap.sheftDate} onChange={(e) => setSwap((x) => ({ ...x, sheftDate: e.target.value }))} /></div>
          <div><Label>{ui('نوع العملية')}</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={swap.ttype} onChange={(e) => setSwap((x) => ({ ...x, ttype: e.target.value }))}><option value="1">{ui('تبديل وردية')}</option><option value="2">{ui('إضافة وردية')}</option></select></div>
          <div><Label>{ui('الوردية')}</Label><Combobox value={swap.dwamIdFk} options={shiftOptions} placeholder={ui('اختر الوردية')} searchPlaceholder={ui('ابحث في الورديات…')} onValueChange={(dwamIdFk) => setSwap((x) => ({ ...x, dwamIdFk }))} /></div>
          <div className="flex items-end"><Button className="w-full" disabled={saving} onClick={() => void saveSwap()}>{ui('حفظ')}</Button></div>
        </div>
        <DataTable {...tableProps} columns={swapColumns} data={swaps.data?.data ?? []} total={swaps.data?.total ?? 0} isLoading={swaps.isLoading} isError={swaps.isError} onRetry={() => void swaps.refetch()} />
      </TabsContent>
      <TabsContent value="extra" className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          <div><Label>{ui('الموظف')}</Label><Combobox value={extra.empId} options={employeeOptions} placeholder={ui('اختر الموظف')} searchPlaceholder={ui('ابحث بالاسم أو الكود…')} onValueChange={(empId) => setExtra((x) => ({ ...x, empId }))} /></div>
          <div><Label>{ui('الإدارة')}</Label><Input disabled value={extraEmployee?.edara_n ?? ''} /></div>
          <div><Label>{ui('القسم')}</Label><Input disabled value={extraEmployee?.qsm_n ?? ''} /></div>
          <div><Label>{ui('التاريخ')}</Label><Input type="date" value={extra.edafaDate} onChange={(e) => setExtra((x) => ({ ...x, edafaDate: e.target.value }))} /></div>
          <div><Label>{ui('عدد الساعات')}</Label><Input type="number" min="1" value={extra.numHours} onChange={(e) => setExtra((x) => ({ ...x, numHours: e.target.value }))} /></div>
          <div className="flex items-end"><Button className="w-full" disabled={saving} onClick={() => void saveExtra()}>{ui('حفظ')}</Button></div>
        </div>
        <DataTable {...tableProps} columns={extraColumns} data={extras.data?.data ?? []} total={extras.data?.total ?? 0} isLoading={extras.isLoading} isError={extras.isError} onRetry={() => void extras.refetch()} />
      </TabsContent>
    </Tabs>
  </div>;
}
