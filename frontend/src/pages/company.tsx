import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FieldWrapper } from '@/components/common/form-fields';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, useResource } from '@/lib/api-hooks';
import type { CompanyRaw } from '@/types/settings';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const schema = z.object({
  name: z.string().min(1, uiStatic('اسم الشركة مطلوب')),
  nameEn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email(uiStatic('بريد إلكتروني غير صالح')).optional().or(z.literal('')),
  address: z.string().optional(),
  slogan: z.string().max(200, uiStatic('الشعار طويل جدًا')).optional(),
  footer: z.string().max(255, uiStatic('نص التذييل طويل جدًا')).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CompanyPage() {
  const { ui } = useLocale();
  const { data, isLoading, isError, error, refetch } = useResource<CompanyRaw>('settings/company');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (data) {
      reset({
        name: data.nameweb ?? '',
        nameEn: data.abbreviation_name ?? '',
        phone: data.telepon ?? data.hp ?? '',
        email: data.email ?? '',
        address: data.address ?? '',
        slogan: data.slogan ?? '',
        footer: data.footer ?? '',
      });
    }
  }, [data, reset]);

  const saveMutation = useMutationWithToast(
    (values: FormValues) =>
      api.patch('/settings/company', {
        nameweb: values.name,
        abbreviation_name: values.nameEn,
        telepon: values.phone,
        email: values.email,
        address: values.address,
        slogan: values.slogan,
        footer: values.footer,
      }),
    { success: ui('تم حفظ بيانات الشركة'), invalidate: ['settings/company'] },
  );

  const onSubmit = (values: FormValues) => saveMutation.mutate(values);

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('بيانات الشركة')} />
        <NotImplementedState title={ui('بيانات الشركة قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title={ui('بيانات الشركة')}
        description={ui('الاسم والعنوان وبيانات التواصل المعروضة في النظام')}
        actions={
          <Button variant="brand" disabled={!isDirty || isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {ui('حفظ')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
              <div className="col-span-full flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <Building2 className="size-8 text-primary" />
                <div>
                  <p className="font-semibold">{ui('بيانات المنشأة')}</p>
                  <p className="text-sm text-muted-foreground">{ui('تُستخدم في التقارير والمراسلات الرسمية')}</p>
                </div>
              </div>
              <FieldWrapper label={ui('اسم الشركة (عربي)')} error={errors.name?.message} required>
                <Input {...register('name')} />
              </FieldWrapper>
              <FieldWrapper label={ui('الاسم المختصر / إنجليزي')} error={errors.nameEn?.message}>
                <Input {...register('nameEn')} />
              </FieldWrapper>
              <FieldWrapper label={ui('الهاتف')} error={errors.phone?.message}>
                <Input {...register('phone')} type="tel" className="nums" />
              </FieldWrapper>
              <FieldWrapper label={ui('البريد الإلكتروني')} error={errors.email?.message}>
                <Input {...register('email')} type="email" />
              </FieldWrapper>
              <div className="col-span-full">
                <FieldWrapper label={ui('العنوان')} error={errors.address?.message}>
                  <Textarea {...register('address')} rows={3} />
                </FieldWrapper>
              </div>
              <div className="col-span-full">
                <FieldWrapper
                  label={ui('الجملة التعريفية (تظهر في بيانات التواصل بتذييل الموقع)')}
                  error={errors.slogan?.message}
                >
                  <Input {...register('slogan')} maxLength={200} />
                </FieldWrapper>
              </div>
              <div className="col-span-full">
                <FieldWrapper
                  label={ui('نص تذييل الموقع (الفقرة الظاهرة أسفل الشعار في تذييل الموقع)')}
                  error={errors.footer?.message}
                >
                  <Textarea {...register('footer')} rows={2} maxLength={255} />
                </FieldWrapper>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
