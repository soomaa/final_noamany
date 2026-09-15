import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { DualDateField, FieldWrapper, RHFSelect, RHFTextarea } from '@/components/common/form-fields';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PrintView } from '@/components/common/print-view';
import { NotImplementedState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { getRequestTypeMap, REQUEST_TYPE_KEYS, type RequestTypeKey } from '@/lib/i18n-constants';
import { useBranches } from '@/hooks/use-branches';
import { useLocale } from '@/store/locale';
import { validateDateOrder } from '@/lib/validators';
import { uiStatic } from '@/lib/ui-static';

const baseSchema = z.object({
  notes: z.string().optional(),
  attachment: z.any().optional(),
});

const schemas: Record<RequestTypeKey, z.ZodType> = {
  leave: baseSchema.extend({
    leave_type_id: z.string().min(1, uiStatic('نوع الإجازة مطلوب')),
    date_from: z.string().min(1, uiStatic('تاريخ البداية مطلوب')),
    date_to: z.string().min(1, uiStatic('تاريخ النهاية مطلوب')),
    substitute_id: z.string().optional(),
  }).superRefine((v, ctx) => {
    const err = validateDateOrder(v.date_from, v.date_to);
    if (err) ctx.addIssue({ code: 'custom', message: err, path: ['date_to'] });
  }),
  permission: baseSchema.extend({
    permission_type: z.string().min(1, uiStatic('نوع الإذن مطلوب')),
    permission_period: z.string().optional(),
    permission_date: z.string().min(1, uiStatic('التاريخ مطلوب')),
    time_from: z.string().min(1),
    time_to: z.string().min(1),
    reason: z.string().min(1, uiStatic('السبب مطلوب')),
  }),
  advance: baseSchema.extend({
    amount: z.coerce.number().positive(uiStatic('المبلغ يجب أن يكون موجبًا')),
    reason: z.string().min(1),
  }),
  loan: baseSchema.extend({
    amount: z.coerce.number().positive(uiStatic('المبلغ يجب أن يكون موجبًا')),
    installments: z.coerce.number().int().positive(uiStatic('عدد الأقساط غير صالح')),
    reason: z.string().min(1),
  }),
  allowance: baseSchema.extend({
    allowance_type_id: z.string().min(1),
    amount: z.coerce.number().positive(uiStatic('المبلغ يجب أن يكون موجبًا')),
    reason: z.string().min(1),
  }),
  'salary-certificate': baseSchema.extend({ purpose: z.string().min(1, uiStatic('الغرض مطلوب')), directed_to: z.string().optional() }),
  resignation: baseSchema.extend({ last_work_day: z.string().min(1), reason: z.string().min(1) }),
  transfer: baseSchema.extend({ target_branch_id: z.string().min(1), target_department_id: z.string().optional(), reason: z.string().min(1) }),
  promotion: baseSchema.extend({ new_job_title: z.string().min(1), new_salary: z.string().optional(), reason: z.string().min(1) }),
  'data-change': baseSchema.extend({ field_name: z.string().min(1), old_value: z.string().optional(), new_value: z.string().min(1), reason: z.string().min(1) }),
};

export function RequestNewPage() {
  const { t, ui } = useLocale();
  const { type } = useParams<{ type: string }>();
  const requestTypeMap = useMemo(() => getRequestTypeMap(t), [t]);
  const meta = type && REQUEST_TYPE_KEYS.includes(type as RequestTypeKey) ? requestTypeMap[type as RequestTypeKey] : null;
  const navigate = useNavigate();
  const schema = meta ? schemas[meta.key as RequestTypeKey] : baseSchema;

  const { data: leaveTypes } = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; title: string; agazaTtype?: number; isActive?: boolean }[] }>('/leaves/types', { params: { pageSize: 200 } });
      return data.data ?? [];
    },
    enabled: meta?.key === 'leave',
  });

  const { data: allowanceTypes } = useQuery({
    queryKey: ['lookups', 'allowance'],
    queryFn: async () => {
      const { data } = await api.get<{ id: number; title: string }[]>('/lookups/allowance');
      return data ?? [];
    },
    enabled: meta?.key === 'allowance',
  });

  // Employee directory (substitute picker), branches & departments (transfer targets).
  const { data: employees } = useQuery({
    queryKey: ['employees', 'request-form'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; employee?: string; name?: string }[] }>('/employees', {
        params: { pageSize: 200 },
      });
      return data.data ?? [];
    },
    enabled: meta?.key === 'leave',
  });
  const { data: branches } = useBranches();
  const { data: departments } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: async () => {
      const { data } = await api.get<{ id: number; title?: string }[]>('/departments/tree');
      return data ?? [];
    },
    enabled: meta?.key === 'transfer',
  });

  const employeeOptions = useMemo(
    () => (employees ?? []).map((e) => ({ value: String(e.id), label: e.employee ?? e.name ?? String(e.id) })),
    [employees],
  );
  const branchOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    [branches],
  );
  const departmentOptions = useMemo(
    () => (departments ?? []).map((d) => ({ value: String(d.id), label: d.title ?? '—' })),
    [departments],
  );

  const leaveTypeOptions = useMemo(
    () => (leaveTypes ?? [])
      .filter((t) => t.agazaTtype === 0 && t.isActive !== false)
      .map((t) => ({ value: String(t.id), label: t.title })),
    [leaveTypes],
  );
  const allowanceTypeOptions = useMemo(
    () => (allowanceTypes ?? []).map((t) => ({ value: String(t.id), label: t.title ?? String(t.id) })),
    [allowanceTypes],
  );

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: Record<string, unknown>) => {
    if (!meta) return;
    try {
      if (meta.key === 'permission') {
        await api.post('/permissions', {
          no3Ezn: Number(values.permission_type),
          fatraFk: values.permission_period ? Number(values.permission_period) : undefined,
          eznDate: values.permission_date,
          fromHour: values.time_from,
          toHour: values.time_to,
          reason: values.reason,
        });
        toast.success(ui('تم إرسال طلب الإذن'));
        navigate('/permissions');
        return;
      }
      await api.post('/requests', { type: meta.key, ...values });
      toast.success(ui('تم إرسال الطلب'));
      navigate('/requests');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!meta) {
    return (
      <div>
        <PageHeader title={ui('طلب جديد')} />
        <NotImplementedState title={ui('نوع الطلب غير معروف')} />
      </div>
    );
  }

  const FormBody = () => {
    switch (meta.key) {
      case 'leave':
        return (
          <>
            <RHFSelect control={control} name="leave_type_id" label={ui('نوع الإجازة')} required options={leaveTypeOptions} />
            <DualDateField label={ui('من')} gregorianValue={watch('date_from')} onGregorianChange={(v) => setValue('date_from', v)} />
            <DualDateField label={ui('إلى')} gregorianValue={watch('date_to')} onGregorianChange={(v) => setValue('date_to', v)} />
            <RHFSelect control={control} name="substitute_id" label={ui('البديل')} options={employeeOptions} />
          </>
        );
      case 'permission':
        return (
          <>
            <RHFSelect control={control} name="permission_type" label={ui('نوع الإذن')} required options={[
              { value: '1', label: ui('استئذان شخصي') },
              { value: '2', label: ui('استئذان للعمل') },
            ]} />
            <RHFSelect control={control} name="permission_period" label={ui('الفترة')} options={[
              { value: '1', label: ui('فترة صباحية') },
              { value: '2', label: ui('فترة مسائية') },
            ]} />
            <DualDateField label={ui('التاريخ')} gregorianValue={watch('permission_date')} onGregorianChange={(v) => setValue('permission_date', v)} />
            <FieldWrapper label={ui('من')}><Time12Input value={watch('time_from')} onValueChange={(value) => setValue('time_from', value, { shouldValidate: true })} /></FieldWrapper>
            <FieldWrapper label={ui('إلى')}><Time12Input value={watch('time_to')} onValueChange={(value) => setValue('time_to', value, { shouldValidate: true })} /></FieldWrapper>
            <RHFTextarea control={control} name="reason" label={ui('السبب')} required />
          </>
        );
      case 'advance':
      case 'loan':
        return (
          <>
            <FieldWrapper label={ui('المبلغ')} error={(errors as { amount?: { message?: string } }).amount?.message} required>
              <Input {...register('amount')} className="nums" />
            </FieldWrapper>
            {meta.key === 'loan' && <FieldWrapper label={ui('عدد الأقساط')}><Input {...register('installments')} className="nums" /></FieldWrapper>}
            <RHFTextarea control={control} name="reason" label={ui('السبب')} required />
          </>
        );
      case 'allowance':
        return (
          <>
            <RHFSelect control={control} name="allowance_type_id" label={ui('نوع البدل')} required options={allowanceTypeOptions} />
            <FieldWrapper label={ui('المبلغ')}><Input {...register('amount')} className="nums" /></FieldWrapper>
            <RHFTextarea control={control} name="reason" label={ui('السبب')} required />
          </>
        );
      case 'salary-certificate':
        return (
          <PrintView title={ui('تعريف مرتب')}>
            <FieldWrapper label={ui('موجّه إلى')}><Input {...register('directed_to')} placeholder={ui('جهة التعريف')} /></FieldWrapper>
            <RHFTextarea control={control} name="purpose" label={ui('الغرض من التعريف')} required />
            <p className="text-sm text-muted-foreground">{ui('بعد الاعتماد يمكن طباعة التعريف من صفحة تفاصيل الطلب.')}</p>
          </PrintView>
        );
      case 'resignation':
        return (
          <>
            <DualDateField label={ui('آخر يوم عمل')} gregorianValue={watch('last_work_day')} onGregorianChange={(v) => setValue('last_work_day', v)} />
            <RHFTextarea control={control} name="reason" label={ui('سبب الاستقالة')} required />
          </>
        );
      case 'transfer':
        return (
          <>
            <RHFSelect control={control} name="target_branch_id" label={ui('الفرع المستهدف')} required options={branchOptions} />
            <RHFSelect control={control} name="target_department_id" label={ui('القسم المستهدف')} options={departmentOptions} />
            <RHFTextarea control={control} name="reason" label={ui('السبب')} required />
          </>
        );
      case 'promotion':
        return (
          <>
            <FieldWrapper label={ui('المسمى الجديد')}><Input {...register('new_job_title')} /></FieldWrapper>
            <FieldWrapper label={ui('الراتب الجديد')}><Input {...register('new_salary')} className="nums" /></FieldWrapper>
            <RHFTextarea control={control} name="reason" label={ui('مبررات الترقية')} required />
          </>
        );
      case 'data-change':
        return (
          <>
            <FieldWrapper label={ui('الحقل المطلوب تعديله')}><Input {...register('field_name')} /></FieldWrapper>
            <FieldWrapper label={ui('القيمة الحالية')}><Input {...register('old_value')} /></FieldWrapper>
            <FieldWrapper label={ui('القيمة الجديدة')}><Input {...register('new_value')} /></FieldWrapper>
            <RHFTextarea control={control} name="reason" label={ui('السبب')} required />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title={meta.label}
        actions={
          <Button variant="outline" asChild>
            <Link to="/requests"><ArrowRight className="size-4" />{ui('العودة')}</Link>
          </Button>
        }
      />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FormBody />
          </div>
          <RHFTextarea control={control} name="notes" label={ui('ملاحظات إضافية')} />
          <FieldWrapper label={ui('مرفق')}>
            <FileDropzone value={null} onChange={() => {}} accept="image/*,.pdf" />
          </FieldWrapper>
        </Card>
        <div className="mt-6 flex justify-end gap-2">
          {'printable' in meta && meta.printable && (
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> {ui('معاينة الطباعة')}
            </Button>
          )}
          <Button type="submit" variant="brand" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {ui('إرسال الطلب')}
          </Button>
        </div>
      </form>
    </div>
  );
}
