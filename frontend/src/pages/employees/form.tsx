import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Save, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/page-header';
import {
  DualDateField,
  FieldWrapper,
  RHFSelect,
  RHFRadio,
  RHFTextarea,
} from '@/components/common/form-fields';
import {
  EmployeeDocumentsEditor,
  type EmployeeDocumentRow,
} from '@/components/employees/employee-documents-editor';
import { UploadField } from '@/components/employees/upload-fields';
import { useFileUpload } from '@/components/employees/use-uploads';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { useLookups, useResource, isNotImplemented } from '@/lib/api-hooks';
import { useBranches } from '@/hooks/use-branches';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import type { EmployeeDocumentFile } from '@/types/employees';
import type { DeptNode, JobTitle } from '@/types/org';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { cn } from '@/lib/utils';

const FORM_SECTIONS = [
  { id: 'personal', title: uiStatic('البيانات الشخصية') },
  { id: 'work', title: uiStatic('بيانات العمل') },
  { id: 'insurance', title: uiStatic('التأمينات') },
  { id: 'documents', title: uiStatic('المستندات') },
] as const;

const schema = z.object({
  emp_code: z.string().min(1, uiStatic('كود الموظف مطلوب')),
  emp_name: z.string().min(1, uiStatic('اسم الموظف مطلوب')),
  direct_manager_fk: z.string().optional(),
  branch_id_fk: z.string().min(1, uiStatic('الفرع مطلوب')),
  emp_type: z.string().min(1, uiStatic('النوع مطلوب')),
  edara_id_fk: z.string().min(1, uiStatic('الإدارة مطلوبة')),
  qsm_id_fk: z.string().min(1, uiStatic('القسم مطلوب')),
  job_title_id_fk: z.string().min(1, uiStatic('المسمى الوظيفي مطلوب')),
  monthly_target: z.string().optional(),
  class_commission_percentage: z.string().optional(),
  addToSystem: z.boolean().optional(),
  birth_date: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  nationality_fk: z.string().optional(),
  deyana_fk: z.string().optional(),
  jwal: z.string().min(1, uiStatic('رقم الجوال مطلوب')),
  card_num: z.string().optional(),
  card_esdar_date: z.string().optional(),
  card_enhaa_date: z.string().optional(),
  address: z.string().optional(),
  emp_sign: z.string().min(1, uiStatic('مكان البصمة مطلوب')),
  personal_photo: z.string().optional(),
  emp_code_gym: z.string().optional(),
  birth_img: z.string().optional(),
  qualification_img: z.string().optional(),
  phesh_genai: z.string().optional(),
  shahadt_jaish: z.string().optional(),
  military_service: z.string().optional(),
  e3fa_reason: z.string().optional(),
  employee_qualification: z.string().optional(),
  previous_experience: z.string().optional(),
  skills: z.string().optional(),
  languages: z.string().optional(),
  national_status_fk: z.string().optional(),
  birthdate: z.string().optional(),
  other_jwal: z.string().optional(),
  tahwela_rkm: z.string().optional(),
  type_card: z.string().optional(),
  gehat_esdar: z.string().optional(),
  esdar_date: z.string().optional(),
  end_date: z.string().optional(),
  city: z.string().optional(),
  hai_id_fk: z.string().optional(),
  street_name: z.string().optional(),
  national_address: z.string().optional(),
  adress_other: z.string().optional(),
  email: z.string().optional(),
  snap_chat: z.string().optional(),
  twiter: z.string().optional(),
  mosma_wazefy_n: z.string().optional(),
  contract: z.string().optional(),
  start_work_date_m: z.string().optional(),
  test_num_month: z.string().optional(),
  end_contract_date_m: z.string().optional(),
  end_test_date_m: z.string().optional(),
  employee_type: z.string().optional(),
  type_tamin: z.string().optional(),
  tamin_rkm: z.string().optional(),
  tamin_mosama_wazefy: z.string().optional(),
  start_tamin_date_m: z.string().optional(),
  tamin_date_m: z.string().optional(),
  tamin_rateb: z.string().optional(),
  tamin_hesa_emp: z.string().optional(),
  tamin_hesa_oner: z.string().optional(),
  type_tamin__medicine: z.string().optional(),
  tamin_company: z.string().optional(),
  tamin_medicine_num: z.string().optional(),
  polica_num: z.string().optional(),
  tamin_type: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type EmployeeFormResponse = FormValues & {
  branch_name?: string;
  edara_name?: string;
  qsm_name?: string;
  job_title_name?: string;
};

type SelectOption = { value: string; label: string };

function includeCurrentOption(
  options: SelectOption[],
  value: string | undefined,
  label: string | undefined,
  fallbackLabel: string,
): SelectOption[] {
  const current = String(value ?? '').trim();
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: label?.trim() || `${fallbackLabel} (${current})` }, ...options];
}

function firstValidationError(errors: FieldErrors<FormValues>): string | undefined {
  for (const key of Object.keys(errors) as (keyof FormValues)[]) {
    const message = errors[key]?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return undefined;
}


const MILITARY = [{ value: '1', label: uiStatic('أدى') }, { value: '2', label: uiStatic('لم يؤدِ') }, { value: '3', label: uiStatic('إعفاء') }];

function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border/60 bg-muted/20 p-5', className)}>
      <div className="mb-4 border-b border-border/50 pb-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function EmployeeFormPage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const { upload } = useFileUpload();

  const { data: existing, isLoading, isError, error, refetch } = useResource<EmployeeFormResponse>('employees', id);
  const { data: docsData } = useResource<EmployeeDocumentFile[]>('employees', id, 'documents');
  const { data: genders } = useLookups('gender');
  const { data: nationalities } = useLookups('nationality');
  const { data: religions } = useLookups('religion');
  const { data: socialStatus } = useLookups('social_status');
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const managerOptions = useMemo(
    () =>
      employeeOptions.map((o) => {
        const label =
          o?.label ??
          `${(o as { employee?: string }).employee ?? '—'} (${(o as { emp_code?: number; id?: number }).emp_code ?? (o as { id?: number }).id ?? '—'})`;
        const fallbackValue = o?.value ?? String((o as { id?: number }).id ?? '');
        return {
          value: label.match(/\((\d+)\)/)?.[1] ?? fallbackValue,
          label,
        };
      }),
    [employeeOptions],
  );

  const { data: jobTitles } = useQuery({
    queryKey: ['departments', 'job-titles'],
    queryFn: async () => {
      const { data } = await api.get<JobTitle[]>('/departments/job-titles');
      return data;
    },
    retry: false,
  });

  const { data: departmentTree } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: async () => {
      const { data } = await api.get<DeptNode[]>('/departments/tree');
      return data;
    },
    retry: false,
  });

  const { data: branches } = useBranches();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    shouldUnregister: false,
    defaultValues: {
      emp_type: '1',
      military_service: '1',
      birth_img: 'no',
      qualification_img: 'no',
      phesh_genai: 'no',
      shahadt_jaish: 'no',
      employee_type: '1',
      emp_sign: '',
      addToSystem: false,
      personal_photo: '',
      monthly_target: '0',
      class_commission_percentage: '0',
    },
  });

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = form;
  const addToSystem = watch('addToSystem');
  const selectedDepartmentId = watch('edara_id_fk');
  const departmentOptions = useMemo(
    () => (departmentTree ?? []).map((department) => ({ value: String(department.id), label: department.title ?? '—' })),
    [departmentTree],
  );
  const sectionOptions = useMemo(() => {
    const selected = (departmentTree ?? []).find((department) => String(department.id) === selectedDepartmentId);
    return (selected?.children ?? []).map((section) => ({ value: String(section.id), label: section.title ?? '—' }));
  }, [departmentTree, selectedDepartmentId]);
  const filteredJobTitles = useMemo(
    () => (jobTitles ?? []).filter((job) => !selectedDepartmentId || job.edaraId == null || String(job.edaraId) === selectedDepartmentId),
    [jobTitles, selectedDepartmentId],
  );
  const selectedJobTitle = jobTitles?.find((job) => String(job.id) === watch('job_title_id_fk'));
  const isTrainerEmployee =
    !!selectedJobTitle?.isTrainer ||
    ['مدرب', 'مدرب لياقة', 'مدربة لياقة'].includes(selectedJobTitle?.name?.trim() ?? '');

  useEffect(() => {
    if (existing) {
      const rawAdd = (existing as Record<string, unknown>).addToSystem;
      form.reset({
        ...(existing as FormValues),
        addToSystem: rawAdd === true || rawAdd === 'true',
      });
    }
  }, [existing, form]);

  useEffect(() => {
    if (docsData?.length) {
      setDocuments(
        docsData.map((d) => ({
          id: String(d.id),
          title: d.title,
          file: null,
          filePath: d.emp_file ?? '',
          have_date: d.have_date === 1,
          from_date: d.from_date ?? '',
          to_date: d.to_date ?? '',
          tanbih: d.tanbih_fk === 1,
          period: String(d.period ?? 30),
        })),
      );
    }
  }, [docsData]);

  useEffect(() => {
    if (!isEdit) {
      api.get<{ nextCode: number }>('/employees/next-code')
        .then(({ data }) => setValue('emp_code', String(data.nextCode)))
        .catch(() => {
          setValue('emp_code', '');
          toast.error(ui('تعذّر جلب كود الموظف — أعد تحميل الصفحة'));
        });
    }
  }, [isEdit, setValue, ui]);

  const birthDate = watch('birth_date');
  useEffect(() => {
    if (!birthDate) return;
    const bd = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    setValue('age', String(age));
  }, [birthDate, setValue]);

  const onFormInvalid = (formErrors: FieldErrors<FormValues>) => {
    const message = firstValidationError(formErrors) ?? ui('يرجى إكمال الحقول المطلوبة');
    toast.error(message);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Upload each new document binary → its stored path (emp_file).
      const docRows: Array<Record<string, unknown>> = [];
      for (const d of documents) {
        if (!d.title.trim()) continue;
        let filePath = d.filePath ?? '';
        if (d.file) {
          const p = await upload('document', d.file);
          if (p) filePath = p;
        }
        docRows.push({
          id: /^\d+$/.test(d.id) ? Number(d.id) : undefined,
          file_type: d.title,
          file_name: d.title,
          file_path: filePath || undefined,
          expire_date: d.have_date ? d.to_date : undefined,
        });
      }

      if (isEdit) {
        const empId = Number(id);
        await api.put(`/employees/${empId}`, { ...values, addToSystem: !!values.addToSystem });
        await api.put(`/employees/${empId}/documents`, { rows: docRows });
        toast.success(ui('تم تحديث بيانات الموظف'));
      } else {
        const { data: created } = await api.post<{ id: number; emp_code: number }>('/employees', {
          ...values,
          addToSystem: !!values.addToSystem,
        });
        if (docRows.length) await api.put(`/employees/${created.id}/documents`, { rows: docRows });
        toast.success(ui('تم إضافة الموظف'));
      }
      navigate('/employees');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const lookupOptions = (items?: { id: number; title: string }[]) =>
    items?.map((i) => ({ value: String(i.id), label: i.title })) ?? [];

  const branchOptions = includeCurrentOption(
    branches?.map((b) => ({ value: String(b.id), label: b.name ?? '—' })) ?? [],
    existing?.branch_id_fk,
    existing?.branch_name,
    ui('الفرع الحالي'),
  );
  const departmentSelectOptions = includeCurrentOption(
    departmentOptions,
    existing?.edara_id_fk,
    existing?.edara_name,
    ui('الإدارة الحالية'),
  );
  const sectionSelectOptions = includeCurrentOption(
    sectionOptions,
    existing?.qsm_id_fk,
    existing?.qsm_name,
    ui('القسم الحالي'),
  );
  const jobTitleSelectOptions = includeCurrentOption(
    filteredJobTitles.map((job) => ({ value: String(job.id), label: job.name ?? '—' })),
    existing?.job_title_id_fk,
    existing?.job_title_name,
    ui('المسمى الحالي'),
  );
  const fingerprintBranchOptions = [
    { value: 'all', label: ui('إدارة (كل الفروع)') },
    ...branchOptions,
  ];

  if (isEdit && isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('تعديل موظف')} />
        <NotImplementedState title={ui('نموذج الموظف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isEdit && isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  if (isEdit && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const renderSection = (sectionId: (typeof FORM_SECTIONS)[number]['id']) => {
    switch (sectionId) {
      case 'personal':
        return (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
              <Card className="flex flex-col items-center gap-4 border-border/60 bg-gradient-to-b from-primary/5 to-card p-5 shadow-sm">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="size-7" />
                </div>
                <FieldWrapper label={ui('الصورة الشخصية')} className="w-full">
                  <input type="hidden" {...register('personal_photo')} />
                  <UploadField
                    category="emp-photo"
                    accept="image/*"
                    value={watch('personal_photo')}
                    onChange={(p) => setValue('personal_photo', p ?? '', { shouldDirty: true, shouldValidate: true })}
                    label={ui('رفع صورة الموظف')}
                  />
                </FieldWrapper>
              </Card>

              <FormSection title={ui('البيانات الأساسية')} description={ui('الفرع والمسمى الوظيفي وبيانات التعريف')}>
                <FieldWrapper label={ui('كود الموظف')} error={errors.emp_code?.message} required>
                  <Input {...register('emp_code')} readOnly className="bg-muted nums" />
                </FieldWrapper>
                <FieldWrapper label={ui('اسم الموظف')} error={errors.emp_name?.message} required>
                  <Input {...register('emp_name')} />
                </FieldWrapper>
                <FieldWrapper label={ui('رقم الهاتف')} error={errors.jwal?.message} required>
                  <Input {...register('jwal')} type="tel" className="nums" />
                </FieldWrapper>
                <RHFSelect control={control} name="branch_id_fk" label={ui('الفرع')} required options={branchOptions} />
                <div className="space-y-1">
                  <RHFSelect
                    control={control}
                    name="emp_sign"
                    label={ui('مكان البصمة')}
                    required
                    options={fingerprintBranchOptions}
                  />
                  <p className="text-xs text-muted-foreground">
                    {ui('اختيار «إدارة» يسمح للموظف بالبصمة في كل الفروع.')}
                  </p>
                </div>
                <RHFRadio
                  control={control}
                  name="emp_type"
                  label={ui('حريمى/رجالى')}
                  required
                  options={[
                    { value: '1', label: ui('رجالى') },
                    { value: '2', label: ui('حريمى') },
                  ]}
                />
                <RHFSelect control={control} name="edara_id_fk" label={ui('الإدارة')} required options={departmentSelectOptions} />
                <RHFSelect control={control} name="qsm_id_fk" label={ui('القسم')} required options={sectionSelectOptions} />
                <RHFSelect control={control} name="job_title_id_fk" label={ui('المسمى الوظيفي')} required options={jobTitleSelectOptions} />
                {isTrainerEmployee ? (
                  <>
                    <FieldWrapper label={ui('التارجت الشهري')} hint={ui('الهدف الشهري للمدرب.')}>
                      <Input type="number" min={0} step="0.01" className="nums" {...register('monthly_target')} />
                    </FieldWrapper>
                    <FieldWrapper label={ui('العمولة (%)')} hint={ui('تُستخدم لحساب مستحقات المدرب من الحصص المنفذة.')}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        className="nums"
                        {...register('class_commission_percentage')}
                      />
                    </FieldWrapper>
                  </>
                ) : null}
              </FormSection>
            </div>

            <FormSection title={ui('البيانات الشخصية')}>
              <FieldWrapper label={ui('تاريخ الميلاد')}>
                <Input type="date" className="nums" {...register('birth_date')} />
              </FieldWrapper>
              <FieldWrapper label={ui('السن')}>
                <Input {...register('age')} readOnly className="bg-muted nums" />
              </FieldWrapper>
              <RHFSelect control={control} name="gender" label={ui('الجنس')} options={lookupOptions(genders)} />
              <RHFSelect control={control} name="nationality_fk" label={ui('الجنسية')} options={lookupOptions(nationalities)} />
              <RHFSelect control={control} name="deyana_fk" label={ui('الديانة')} options={lookupOptions(religions)} />
              <RHFSelect control={control} name="national_status_fk" label={ui('الحالة الاجتماعية')} options={lookupOptions(socialStatus)} />
              <FieldWrapper label={ui('الرقم القومي / البطاقة')}>
                <Input {...register('card_num')} className="nums" />
              </FieldWrapper>
              <RHFRadio control={control} name="military_service" label={ui('الخدمة العسكرية')} options={MILITARY} />
            </FormSection>

          </div>
        );
      case 'work':
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <RHFSelect control={control} name="direct_manager_fk" label={ui('المدير المباشر')} options={managerOptions} />
              <DualDateField label={ui('تاريخ التعيين')} gregorianValue={watch('start_work_date_m')} onGregorianChange={(v) => setValue('start_work_date_m', v)} showHijri={false} showGregorianLabel={false} />
              <RHFRadio control={control} name="employee_type" label={ui('حالة الموظف')} options={[{ value: '1', label: ui('نشط') }, { value: '2', label: ui('موقوف') }]} />
            </div>
            <div className="border-t border-border pt-6">
              <h3 className="mb-1 font-semibold">{ui('حساب الموظف')}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {ui('يُنشأ تلقائياً حساب واحد لتطبيق البصمة باسم المستخدم رقم الجوال وكلمة المرور الابتدائية 102030.')}
              </p>
              <div className="mb-4 flex items-center gap-2">
                <Checkbox
                  id="add-to-system"
                  checked={!!addToSystem}
                  onCheckedChange={(v) => setValue('addToSystem', v === true)}
                />
                <label htmlFor="add-to-system" className="text-sm font-medium">{ui('منح صلاحيات لوحة النظام لهذا الحساب')}</label>
              </div>
            </div>
            <section className="rounded-xl border border-border/60 bg-muted/20 p-5">
              <div className="mb-4 border-b border-border/50 pb-3">
                <h3 className="text-base font-semibold text-foreground">{ui('المؤهل والخبرات')}</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label={ui('نوع المؤهل الدراسي')}>
                  <Input {...register('employee_qualification')} />
                </FieldWrapper>
                <div className="col-span-full space-y-4">
                  <RHFTextarea control={control} name="previous_experience" label={ui('الخبرات السابقة')} rows={3} />
                  <RHFTextarea control={control} name="skills" label={ui('المهارات')} rows={2} hint={ui('افصل بين المهارات بفاصلة')} />
                  <RHFTextarea control={control} name="languages" label={ui('اللغات')} rows={2} hint={ui('مثال: العربية، الإنجليزية')} />
                </div>
              </div>
            </section>
          </div>
        );
      case 'insurance':
        return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FieldWrapper label={ui('نوع التأمين الاجتماعي')}><Input {...register('type_tamin')} /></FieldWrapper>
            <FieldWrapper label={ui('رقم التأمين')}><Input {...register('tamin_rkm')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('المسمى التأميني')}><Input {...register('tamin_mosama_wazefy')} /></FieldWrapper>
            <DualDateField label={ui('تاريخ بدء التأمين')} gregorianValue={watch('start_tamin_date_m')} onGregorianChange={(v) => setValue('start_tamin_date_m', v)} showHijri={false} />
            <DualDateField label={ui('تاريخ التأمين')} gregorianValue={watch('tamin_date_m')} onGregorianChange={(v) => setValue('tamin_date_m', v)} showHijri={false} />
            <FieldWrapper label={ui('الأجر التأميني')}><Input {...register('tamin_rateb')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('حصة الموظف')}><Input {...register('tamin_hesa_emp')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('حصة صاحب العمل')}><Input {...register('tamin_hesa_oner')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('التأمين الطبي')}><Input {...register('type_tamin__medicine')} /></FieldWrapper>
            <FieldWrapper label={ui('شركة التأمين')}><Input {...register('tamin_company')} /></FieldWrapper>
            <FieldWrapper label={ui('رقم التأمين الطبي')}><Input {...register('tamin_medicine_num')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('رقم البوليصة')}><Input {...register('polica_num')} /></FieldWrapper>
          </div>
        );
      case 'documents':
        return <EmployeeDocumentsEditor documents={documents} onChange={setDocuments} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? ui('تعديل موظف') : ui('موظف جديد')}
        actions={<Button variant="outline" asChild><Link to="/employees"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>}
      />
      <form onSubmit={handleSubmit(onSubmit, onFormInvalid)}>
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {FORM_SECTIONS.map((section) => (
            <Card key={section.id} className="rounded-2xl border border-border/60 bg-card p-6 shadow-md">
              <div className="mb-6 border-b border-border/60 pb-3">
                <h2 className="text-lg font-bold">{ui(section.title)}</h2>
              </div>
              {renderSection(section.id)}
            </Card>
          ))}
        </div>
        <div className="mx-auto mt-6 flex w-full max-w-5xl justify-end">
          <Button type="submit" variant="brand" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" /> {isEdit ? ui('حفظ بيانات الموظف') : ui('إنشاء الموظف')}
          </Button>
        </div>
      </form>
    </div>
  );
}
