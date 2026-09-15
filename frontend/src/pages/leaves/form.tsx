import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Combobox } from '@/components/common/combobox';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast } from '@/lib/api-hooks';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { toArabicDigits } from '@/lib/utils';

const schema = z
  .object({
    leaveTypeId: z.string().min(1, uiStatic('نوع الإجازة مطلوب')),
    empId: z.string().min(1, uiStatic('اختيار الموظف مطلوب')),
    startDate: z.string().min(1, uiStatic('تاريخ البداية مطلوب')),
    endDate: z.string().min(1, uiStatic('تاريخ النهاية مطلوب')),
    returnToWorkDate: z.string().optional(),
    f2aAgaza: z.string().optional(),
    reason: z.string().optional(),
    addressSinceAgaza: z.string().optional(),
    substituteEmpId: z.string().optional(),
    pledge: z.string().optional(),
    maradName: z.string().optional(),
    hospitalName: z.string().optional(),
    hospitalReport: z.string().optional(),
    taqrerFromDate: z.string().optional(),
    taqrerToDate: z.string().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: uiStatic('تاريخ النهاية يجب أن يكون بعد البداية'),
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

interface LeaveTypeOption {
  id: number;
  title: string;
  agazaTtype?: number;
  isActive?: boolean;
  hasSubstitute?: boolean;
}

interface LeaveBalance {
  balance: number;
  totalAllowed: number;
  usedDays: number;
  controlled: boolean;
}

interface LeaveEmployee {
  id: number;
  emp_code: number;
  employee: string;
  edara_n: string | null;
  qsm_n: string | null;
  phone: string | null;
  mosma_wazefy_n: string | null;
}

function countLeaveDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function nextDay(date: string) {
  if (!date) return '';
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return '';
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || '—'} readOnly className="bg-muted" />
    </div>
  );
}

export function LeaveFormPage() {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: async () => {
      const { data } = await api.get<{ data: LeaveTypeOption[] }>('/leaves/types', { params: { pageSize: 200 } });
      return data.data ?? [];
    },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'leave-form'],
    queryFn: async () => {
      const { data } = await api.get<{ data: LeaveEmployee[] }>('/employees', { params: { pageSize: 500, status: 1 } });
      return data.data ?? [];
    },
  });
  const personalLeaveTypes = leaveTypes.filter((leaveType) => leaveType.agazaTtype === 0 && leaveType.isActive !== false);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leaveTypeId: '', empId: '', startDate: '', endDate: '', returnToWorkDate: '',
      f2aAgaza: '', reason: '', addressSinceAgaza: '', substituteEmpId: '', pledge: '',
      maradName: '', hospitalName: '', hospitalReport: '', taqrerFromDate: '', taqrerToDate: '',
    },
  });

  const selectedEmpId = watch('empId');
  const selectedEmployee = employees.find((employee) => String(employee.id) === selectedEmpId);
  const selectedLeaveTypeId = watch('leaveTypeId');
  const selectedLeaveType = leaveTypes.find((leaveType) => String(leaveType.id) === selectedLeaveTypeId);
  const sickLeave = selectedLeaveTypeId === '3' || selectedLeaveTypeId === '4';
  const { data: balance } = useQuery({
    queryKey: ['leaves', 'available', selectedEmpId, selectedLeaveTypeId],
    enabled: Boolean(selectedEmpId && selectedLeaveTypeId),
    queryFn: async () => {
      const { data } = await api.get<LeaveBalance>('/leaves/available', {
        params: { empId: Number(selectedEmpId), leaveTypeId: Number(selectedLeaveTypeId) },
      });
      return data;
    },
  });
  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const numDays = countLeaveDays(startDate, endDate);

  const createMutation = useMutationWithToast(
    (values: FormValues) =>
      api.post('/leaves', {
        leaveTypeId: Number(values.leaveTypeId),
        empId: Number(values.empId),
        startDate: values.startDate,
        endDate: values.endDate,
        returnToWorkDate: values.returnToWorkDate || nextDay(values.endDate),
        numDays: countLeaveDays(values.startDate, values.endDate),
        empPhone: selectedEmployee?.phone ?? undefined,
        f2aAgaza: values.f2aAgaza ? Number(values.f2aAgaza) : undefined,
        reason: values.reason?.trim() || undefined,
        addressSinceAgaza: values.addressSinceAgaza?.trim() || undefined,
        substituteEmpId: values.substituteEmpId ? Number(values.substituteEmpId) : undefined,
        pledge: values.pledge?.trim() || undefined,
        maradName: sickLeave ? (values.maradName?.trim() || 'غير محدد') : undefined,
        hospitalName: sickLeave ? values.hospitalName?.trim() || undefined : undefined,
        hospitalReport: sickLeave ? values.hospitalReport?.trim() || undefined : undefined,
        taqrerFromDate: sickLeave ? values.taqrerFromDate || undefined : undefined,
        taqrerToDate: sickLeave ? values.taqrerToDate || undefined : undefined,
      }),
    {
      success: ui('تم إرسال طلب الإجازة'),
      invalidate: ['leaves'],
      onSuccess: () => navigate('/leaves'),
    },
  );

  const onSubmit = async (values: FormValues) => {
    const requestedDays = countLeaveDays(values.startDate, values.endDate);
    if (balance?.controlled && requestedDays > balance.balance) {
      toast.error(ui('عدد أيام الإجازة يتجاوز الرصيد المتاح'));
      return;
    }
    if (sickLeave && !values.hospitalReport?.trim()) {
      toast.error(ui('تقرير المستشفى مطلوب للإجازة المرضية'));
      return;
    }
    if (selectedLeaveType?.hasSubstitute && !values.substituteEmpId) {
      toast.error(ui('اختر الموظف البديل لهذا النوع من الإجازة'));
      return;
    }
    try {
      createMutation.mutate(values);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={ui('طلب إجازة جديد')}
        description={ui('تقديم طلب إجازة جديد للمراجعة والاعتماد')}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/leaves">
              <ArrowRight className="size-4" /> {ui('العودة للإجازات')}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-4xl space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{ui('نوع الإجازة *')}</Label>
              <Controller
                control={control}
                name="leaveTypeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={ui('اختر نوع الإجازة')} />
                    </SelectTrigger>
                    <SelectContent>
                      {personalLeaveTypes.map((leaveType) => (
                        <SelectItem key={leaveType.id} value={String(leaveType.id)}>
                          {leaveType.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.leaveTypeId && <p className="text-xs text-destructive">{errors.leaveTypeId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>{ui('الموظف *')}</Label>
              <Controller
                control={control}
                name="empId"
                render={({ field }) => (
                  <Combobox
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder={ui('اختر الموظف')}
                    searchPlaceholder={ui('ابحث باسم الموظف أو رقمه')}
                    emptyText={ui('لا يوجد موظفون نشطون مطابقون')}
                    options={employees.map((employee) => ({
                      value: String(employee.id),
                      label: employee.employee,
                      description: `${ui('الرقم الوظيفي')}: ${toArabicDigits(employee.emp_code)}`,
                      searchText: `${employee.emp_code} ${employee.phone ?? ''}`,
                    }))}
                  />
                )}
              />
              {errors.empId && <p className="text-xs text-destructive">{errors.empId.message}</p>}
            </div>
            </div>

            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnlyField label={ui('الرقم الوظيفي')} value={selectedEmployee ? toArabicDigits(selectedEmployee.emp_code) : ''} />
              <ReadOnlyField label={ui('المسمى الوظيفي')} value={selectedEmployee?.mosma_wazefy_n ?? ''} />
              <ReadOnlyField label={ui('الإدارة')} value={selectedEmployee?.edara_n ?? ''} />
              <ReadOnlyField label={ui('القسم')} value={selectedEmployee?.qsm_n ?? ''} />
              <ReadOnlyField label={ui('الجوال')} value={selectedEmployee?.phone ?? ''} />
              <ReadOnlyField
                label={ui('الرصيد المتاح')}
                value={balance ? (balance.controlled ? toArabicDigits(balance.balance) : ui('غير محدد لهذا النوع')) : ''}
              />
            </div>

            {selectedLeaveTypeId === '2' && (
              <div className="space-y-2">
                <Label>{ui('فئة الإجازة')}</Label>
                <Controller
                  control={control}
                  name="f2aAgaza"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder={ui('اختر فئة الإجازة')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{ui('طارئة')}</SelectItem>
                        <SelectItem value="2">{ui('عادية')}</SelectItem>
                        <SelectItem value="3">{ui('بدون راتب')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-start-date">{ui('تاريخ البداية *')}</Label>
                <Controller
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <Input id="leave-start-date" type="date" className="nums" value={field.value} onChange={field.onChange} />
                  )}
                />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end-date">{ui('تاريخ النهاية *')}</Label>
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <Input
                      id="leave-end-date"
                      type="date"
                      className="nums"
                      value={field.value}
                      min={watch('startDate') || undefined}
                      onChange={(event) => {
                        field.onChange(event);
                        setValue('returnToWorkDate', nextDay(event.target.value));
                      }}
                    />
                  )}
                />
                {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label={ui('عدد الأيام')} value={numDays ? toArabicDigits(numDays) : ''} />
              <div className="space-y-2">
                <Label htmlFor="return-to-work-date">{ui('مباشرة العمل')}</Label>
                <Input
                  id="return-to-work-date"
                  type="date"
                  className="nums bg-muted"
                  value={watch('returnToWorkDate')}
                  readOnly
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-address">{ui('العنوان أثناء الإجازة')}</Label>
                <Controller control={control} name="addressSinceAgaza" render={({ field }) => <Input id="leave-address" {...field} />} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-reason">{ui('السبب / الملاحظات')}</Label>
                <Controller control={control} name="reason" render={({ field }) => <Input id="leave-reason" {...field} />} />
              </div>
            </div>

            {selectedLeaveType?.hasSubstitute && (
              <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{ui('الموظف البديل *')}</Label>
                  <Controller
                    control={control}
                    name="substituteEmpId"
                    render={({ field }) => (
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        options={employees.filter((employee) => String(employee.id) !== selectedEmpId).map((employee) => ({ value: String(employee.id), label: employee.employee }))}
                        placeholder={ui('اختر الموظف البديل')}
                        searchPlaceholder={ui('بحث في الموظفين…')}
                      />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-pledge">{ui('التعهد *')}</Label>
                  <Controller control={control} name="pledge" render={({ field }) => <Input id="leave-pledge" {...field} />} />
                </div>
              </div>
            )}

            {sickLeave && (
              <div className="space-y-4 rounded-lg border p-4">
                <h3 className="font-semibold">{ui('بيانات التقرير الطبي')}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="illness-name">{ui('اسم المرض')}</Label>
                    <Controller control={control} name="maradName" render={({ field }) => <Input id="illness-name" {...field} />} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hospital-name">{ui('اسم المستشفى')}</Label>
                    <Controller control={control} name="hospitalName" render={({ field }) => <Input id="hospital-name" {...field} />} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medical-from">{ui('بداية التقرير الطبي')}</Label>
                    <Controller control={control} name="taqrerFromDate" render={({ field }) => <Input id="medical-from" type="date" {...field} />} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medical-to">{ui('نهاية التقرير الطبي')}</Label>
                    <Controller control={control} name="taqrerToDate" render={({ field }) => <Input id="medical-to" type="date" {...field} />} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="hospital-report">{ui('تقرير المستشفى *')}</Label>
                    <Input
                      id="hospital-report"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          const body = new FormData();
                          body.append('file', file);
                          const { data } = await api.post<{ path: string }>('/uploads/leave-medical', body);
                          setValue('hospitalReport', data.path, { shouldValidate: true });
                          toast.success(ui('تم رفع تقرير المستشفى'));
                        } catch (error) {
                          toast.error(apiError(error));
                        }
                      }}
                    />
                    {watch('hospitalReport') && <p className="text-xs text-success">{ui('تم إرفاق التقرير')}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="brand" disabled={isSubmitting || createMutation.isPending}>
                {(isSubmitting || createMutation.isPending) && <Loader2 className="size-4 animate-spin" />}
                {ui('إرسال الطلب')}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/leaves">{ui('إلغاء')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
